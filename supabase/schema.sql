-- ============================================================
-- 학습 위키 에이전트 — Supabase 스키마 (Phase 1)
-- roadmap.html의 6개 계층 + images 보조 표를 그대로 SQL로 옮긴 것.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행하면 됨.
-- 개인 단일 사용자 프로젝트지만, 배포 후 URL이 공개되므로
-- Supabase Auth + RLS로 "로그인한 본인 것만" 접근 가능하게 막아둔다.
-- ============================================================

-- gen_random_uuid()용 (Supabase 프로젝트는 기본 활성화되어 있는 경우가 많음)
create extension if not exists pgcrypto;
create extension if not exists pg_trgm; -- 제목/본문 키워드 검색용

-- ------------------------------------------------------------
-- 공통: updated_at 자동 갱신 트리거 함수
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 1. source_files — 원본 계층
-- 업로드한 파일 원본. Storage에는 파일 바이트가, 여기엔 메타데이터가 있다.
-- ============================================================
create table source_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  filename      text not null,
  storage_path  text not null,           -- Supabase Storage 경로 (버킷: source-files)
  mime_type     text,
  byte_size     bigint,
  status        text not null default 'uploaded'
                  check (status in ('uploaded','extracting','extracted','failed')),
  created_at    timestamptz not null default now()
);
create index idx_source_files_user on source_files(user_id);

-- ============================================================
-- 2. text_chunks — 추출 계층
-- 원본에서 뽑아낸 텍스트를 단락 단위로 저장. AI 입력 단위이자 출처 추적 단위.
-- ============================================================
create table text_chunks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source_file_id  uuid not null references source_files(id) on delete cascade,
  chunk_index     integer not null,       -- 파일 내 순서 (0부터)
  content         text not null,
  created_at      timestamptz not null default now(),
  unique (source_file_id, chunk_index)
);
create index idx_text_chunks_source on text_chunks(source_file_id);
create index idx_text_chunks_user on text_chunks(user_id);

-- ============================================================
-- ＋ images — 보조 표 (wiki_pages, quiz_items 양쪽이 id만 참조)
-- 화면 표시용 1600px·WebP 리사이즈 사본만 저장. 원본은 source_files에 그대로.
-- ============================================================
create table images (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source_file_id  uuid references source_files(id) on delete set null,
  storage_path    text not null,          -- 버킷: display-images
  width           integer,
  height          integer,
  file_hash       text,                   -- SHA-256, 같은 이미지 재업로드 방지용 (선택)
  created_at      timestamptz not null default now()
);
create index idx_images_user on images(user_id);
create index idx_images_hash on images(file_hash);

-- ============================================================
-- 3. wiki_pages — 지식 계층
-- AI가 청크를 읽고 생성한 위키 문서 본문. 분류(section)는 사용자가 직접 수정 가능.
-- ============================================================
create table wiki_pages (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  source_chunk_id   uuid references text_chunks(id) on delete set null,  -- 원본 청크 참조 (수동 생성 문서는 null)
  section           text not null,        -- 예: "6장 · 1절 · 라벨 · 소단원" — 분류, TOC 그룹핑에 사용
  title             text not null,
  definition        text not null,
  points            jsonb not null default '[]'::jsonb,   -- string[] — 세부 포인트
  flagged           boolean not null default false,       -- "최신 기준 재확인 필요" 표시
  cover_image_id    uuid references images(id) on delete set null,
  search_text       text generated always as (title || ' ' || definition) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_wiki_pages_user on wiki_pages(user_id);
create index idx_wiki_pages_section on wiki_pages(section);
create index idx_wiki_pages_search_trgm on wiki_pages using gin (search_text gin_trgm_ops);
create trigger trg_wiki_pages_updated_at
  before update on wiki_pages
  for each row execute function set_updated_at();

-- ============================================================
-- 4. wiki_links — 관계 계층
-- 문서 A → 문서 B 연결만 관리. 클릭 이동·역링크·그래프 뷰가 전부 여기서 나온다.
-- ============================================================
create table wiki_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_page_id   uuid not null references wiki_pages(id) on delete cascade,
  to_page_id     uuid not null references wiki_pages(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (from_page_id, to_page_id),
  check (from_page_id <> to_page_id)
);
create index idx_wiki_links_from on wiki_links(from_page_id);
create index idx_wiki_links_to on wiki_links(to_page_id);   -- 역링크(backlink) 조회용

-- ============================================================
-- 5. quiz_items — 퀴즈 계층
-- 위키 문서 생성 시 AI가 여러 형식으로 한 번에 만들어 캐싱해두는 문제 풀.
-- 복습 시에는 이 표에서 로테이션하며 꺼내 쓰고, AI를 다시 부르지 않는다.
-- ============================================================
create table quiz_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  wiki_page_id     uuid not null references wiki_pages(id) on delete cascade,
  type             text not null check (type in
                     ('multiple_choice','fill_blank','true_false','matching',
                      'relation','short_answer','image_recognition')),
  question         jsonb not null,        -- 형식별 구조 (아래 설계 노트 참고)
  answer           jsonb not null,        -- 정답 (형식별 구조)
  answer_variants  jsonb not null default '[]'::jsonb,  -- 서술형: 인정 가능한 표현 변형들
  image_id         uuid references images(id) on delete set null,  -- 이미지 인식 문제용
  created_at       timestamptz not null default now()
);
create index idx_quiz_items_page on quiz_items(wiki_page_id);
create index idx_quiz_items_user_type on quiz_items(user_id, type);

-- ============================================================
-- 6. quiz_attempts — 기록 계층
-- 실제로 푼 기록 + SM-2 망각곡선 상태값. 로그인 시 리마인더의 유일한 데이터 소스.
-- ============================================================
create table quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  quiz_item_id    uuid not null references quiz_items(id) on delete cascade,
  attempted_at    timestamptz not null default now(),
  is_correct      boolean not null,
  user_answer     jsonb,
  -- SM-2 알고리즘 상태 (이 시도 이후 계산된 다음 복습 일정)
  ease_factor     numeric not null default 2.5,
  interval_days   integer not null default 0,
  repetitions     integer not null default 0,
  next_review_at  date not null default current_date
);
create index idx_quiz_attempts_user on quiz_attempts(user_id);
create index idx_quiz_attempts_item on quiz_attempts(quiz_item_id);
create index idx_quiz_attempts_next_review on quiz_attempts(user_id, next_review_at);

-- ============================================================
-- Row Level Security — "로그인한 본인 것만" 보이고 쓸 수 있게 제한
-- 배포 직후 아무나 URL로 들어와 Gemini 무료 할당량을 써버리는 걸 막는
-- 최소한의 접근 제어 (roadmap Phase 2 필수 항목).
-- ============================================================
alter table source_files   enable row level security;
alter table text_chunks    enable row level security;
alter table images         enable row level security;
alter table wiki_pages     enable row level security;
alter table wiki_links     enable row level security;
alter table quiz_items     enable row level security;
alter table quiz_attempts  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['source_files','text_chunks','images','wiki_pages','wiki_links','quiz_items','quiz_attempts']
  loop
    execute format(
      'create policy "%1$s_owner_select" on %1$s for select using (auth.uid() = user_id);', t);
    execute format(
      'create policy "%1$s_owner_insert" on %1$s for insert with check (auth.uid() = user_id);', t);
    execute format(
      'create policy "%1$s_owner_update" on %1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format(
      'create policy "%1$s_owner_delete" on %1$s for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ============================================================
-- 명시적 권한 부여 (프로젝트 생성 시 "Automatically expose new tables"를
-- 껐다는 전제) — RLS 정책만으로는 부족하다: PostgREST(Data API)가 쓰는
-- anon/authenticated 역할은 테이블 자체에 대한 GRANT가 없으면 RLS 정책과
-- 무관하게 "permission denied"로 막힌다. 실제로 로컬 Postgres에 이 GRANT
-- 없이 authenticated 역할로 자기 행(own row)을 insert해봤더니 permission
-- denied가 났고, 아래 GRANT를 추가한 뒤에는 성공하는 것까지 확인했다.
--
-- anon(비로그인) 역할에는 아무 권한도 주지 않는다 — 앱 자체가 모든 경로를
-- 로그인 없이는 못 들어가게 막아뒀으므로(src/proxy.ts) 익명 접근이 애초에
-- 필요 없고, 혹시 프록시를 우회당해도 DB 단에서 한 번 더 막힌다.
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  source_files, text_chunks, images, wiki_pages, wiki_links, quiz_items, quiz_attempts
  to authenticated;

-- ============================================================
-- 설계 노트
-- ------------------------------------------------------------
-- · question/answer jsonb 형식 (type별 예시):
--   multiple_choice: question {"prompt": "...", "choices": ["A","B","C","D"]}
--                     answer   {"correct_index": 2}
--   fill_blank:       question {"text": "OOO는 콘크리트의 배합비다."}
--                     answer   {"blank": "물시멘트비"}
--   true_false:       question {"statement": "..."}
--                     answer   {"is_true": false}
--   matching:         question {"left": ["A","B"], "right": ["1","2"]}
--                     answer   {"pairs": [[0,1],[1,0]]}
--   relation:         question {"a": "wiki_page_id_1", "b": "wiki_page_id_2"}
--                     answer   {"relation": "..."} -- wiki_links에서 그대로 생성, AI 불필요
--   short_answer:     question {"prompt": "..."}
--                     answer   {"canonical": "..."}
--                     answer_variants: ["표현1", "표현2", ...] -- 생성 시 AI가 미리 채점
--   image_recognition: question {"prompt": "이 사진은 무엇인가?"} (image_id 참조)
--                      answer   {"canonical": "..."}
--
-- · search_text는 generated column이라 애플리케이션에서 직접 쓰지 않고
--   `select * from wiki_pages where search_text ilike '%검색어%'` 또는
--   `search_text % '검색어'` (pg_trgm 유사도)로 조회.
--
-- · 이미지 중복 방지가 필요해지면(스토리지 용량 부듯할 때) 업로드 전에
--   `select id from images where file_hash = $1` 로 먼저 확인 후 없을 때만 저장.
-- ============================================================
