-- Phase 6 마이그레이션 — schema.sql을 이미 실행했다면 이 파일만 추가로 실행하세요.
-- "아직 퀴즈가 없는 위키 문서"를 찾는 걸 애플리케이션 코드에서 큰 IN(...) 목록으로 하면
-- 문서가 많아질수록(최종 1104개) 요청 URL이 너무 길어져 실패할 수 있어서, DB 함수(NOT EXISTS
-- 안티조인)로 처리한다 — 인덱스를 그대로 타서 문서가 많아져도 빠르다.

-- Supabase 프로젝트는 기본적으로 이미 authenticated 롤에 auth 스키마 USAGE 권한을 준 상태라
-- 보통 필요 없지만, 혹시 몰라 안전하게 한 번 더 명시한다 (이미 있으면 아무 효과 없음).
grant usage on schema auth to authenticated;

create or replace function get_wiki_pages_without_quiz(limit_count integer)
returns setof wiki_pages
language sql
security invoker
stable
as $$
  select wp.*
  from wiki_pages wp
  where wp.user_id = auth.uid()
    and not exists (
      select 1 from quiz_items qi where qi.wiki_page_id = wp.id
    )
  order by wp.section
  limit limit_count;
$$;

grant execute on function get_wiki_pages_without_quiz(integer) to authenticated;

-- 퀴즈 풀기 화면에서 쓸 무작위 문제 묶음을 뽑는 함수. answer/answer_variants는 절대 내려주지 않는다 —
-- 채점은 사용자가 제출한 뒤 서버에서 코드로 판정하므로, 문제를 받는 시점에 정답이 노출되면 안 된다.
-- p_chapter를 주면(예: '2') 그 장(2장)의 문제만, null이면 전체에서 뽑는다.
create or replace function get_random_quiz_items(p_count integer, p_chapter text default null)
returns table (
  id uuid,
  type text,
  question jsonb,
  page_title text,
  page_section text
)
language sql
security invoker
stable
as $$
  select qi.id, qi.type, qi.question, wp.title as page_title, wp.section as page_section
  from quiz_items qi
  join wiki_pages wp on wp.id = qi.wiki_page_id
  where qi.user_id = auth.uid()
    and (p_chapter is null or wp.section like p_chapter || '장%')
  order by random()
  limit p_count;
$$;

grant execute on function get_random_quiz_items(integer, text) to authenticated;
