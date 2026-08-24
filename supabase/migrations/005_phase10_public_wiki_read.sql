-- Phase 10 (로드맵 이후 추가 요청): 위키 열람을 로그인 없이 공개.
-- 편집(수정·추가)과 AI 생성(위키/퀴즈)은 여전히 로그인이 필요하다 — 이 마이그레이션은
-- wiki_pages/wiki_links의 "읽기(select)"만 비로그인(anon) 사용자에게 열어준다.
--
-- 기존에 있던 "본인 것만 select" 정책(wiki_pages_owner_select 등)은 그대로 둔다 — 지우지
-- 않아도 무해하다: Postgres RLS는 같은 command(select)에 여러 permissive 정책이 있으면
-- OR로 합쳐서 평가하므로, 아래 새 정책이 이미 "누구나 다 보인다"를 허용하기 때문에 기존
-- 정책은 그냥 항상 만족되는 조건으로 남아있을 뿐이다.
--
-- anon 역할에는 select만 준다 — insert/update/delete grant는 주지 않으므로, RLS 정책이
-- 없더라도 anon은 애초에 쓰기 자체가 DB 권한 단에서 막힌다(로컬 Postgres로 직접 확인함).

grant usage on schema public to anon;
grant select on wiki_pages, wiki_links to anon;

create policy "wiki_pages_public_select" on wiki_pages
  for select
  using (true);

create policy "wiki_links_public_select" on wiki_links
  for select
  using (true);
