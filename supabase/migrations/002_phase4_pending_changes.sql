-- ============================================================
-- Phase 4 마이그레이션 — schema.sql을 이미 실행했다면 이 파일만 추가로 실행하세요.
-- AI가 새 개념은 바로 만들고, 기존 문서와 겹치는 내용은 승인 대기열에 넣도록
-- (사용자가 확정한 3단계 편집 권한 모델) 필요한 표와 컬럼을 추가한다.
-- ============================================================

-- 청크가 이미 AI로 처리됐는지 추적 — 같은 파일을 두 번 돌려도 중복 생성/중복 과금이 안 나게 함.
alter table text_chunks add column if not exists processed_at timestamptz;

-- ============================================================
-- pending_changes — AI가 "기존 문서와 겹치지만 추가할 내용이 있음(extend)" 또는
-- "기존 문서를 고쳐야 함(edit)"이라고 판단한 제안을 담아두는 승인 대기열.
-- 사용자가 승인해야만 실제로 wiki_pages에 반영된다 — AI가 기존 위키를 마음대로
-- 바꾸지 않는다는 설계 결정을 그대로 구현한 표.
-- ============================================================
create table pending_changes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  source_chunk_id   uuid references text_chunks(id) on delete set null,
  target_page_id    uuid not null references wiki_pages(id) on delete cascade,
  change_type       text not null check (change_type in ('extend','edit')),
  proposed_title       text not null,
  proposed_definition  text not null,
  proposed_points      jsonb not null default '[]'::jsonb,
  proposed_links        jsonb not null default '[]'::jsonb,  -- 제안된 링크 대상 제목들 (문자열 배열)
  reason            text,                 -- AI가 이 변경이 필요하다고 판단한 이유
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);
create index idx_pending_changes_user_status on pending_changes(user_id, status);
create index idx_pending_changes_target on pending_changes(target_page_id);

alter table pending_changes enable row level security;
create policy "pending_changes_owner_select" on pending_changes for select using (auth.uid() = user_id);
create policy "pending_changes_owner_insert" on pending_changes for insert with check (auth.uid() = user_id);
create policy "pending_changes_owner_update" on pending_changes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pending_changes_owner_delete" on pending_changes for delete using (auth.uid() = user_id);

-- "Automatically expose new tables"를 껐다면 이 표도 명시적으로 권한을 줘야 함 (schema.sql과 동일한 이유).
grant select, insert, update, delete on pending_changes to authenticated;
