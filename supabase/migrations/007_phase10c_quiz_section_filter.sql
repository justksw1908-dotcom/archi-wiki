-- Phase 10 후속(디자인 다음 라운드) — 퀴즈를 장(章) 단위뿐 아니라 절(節) 단위로도 골라 풀 수 있게
-- p_section 매개변수를 추가한다. schema.sql · 002~006을 이미 실행했다면 이 파일만 추가로 실행하세요.
--
-- section 문자열 형태가 장마다 다르다는 걸 이번에 알게 됐다: 대부분 "N장 · N절 · 소제목"이지만
-- 2장만 "2장 · I 콘크리트재료 · 1절 · 시멘트 · 소제목"처럼 장과 절 사이에 대분류가 하나 더 낀다.
-- 그래서 "장 바로 다음에 절이 온다"고 가정한 LIKE 패턴(예: p_chapter || '장 · ' || p_section || '절%')을
-- 안 쓰고, (1) 장으로 시작하는지 (2) 절 번호가 문자열 어딘가에 있는지를 따로 확인한다.
-- 절 번호는 정규식으로 "앞에 다른 숫자가 안 오는 N절"만 매치해서 1절이 11절에 잘못 걸리는 걸 막는다
-- (지금 데이터는 장당 최대 7절이라 실제로 걸릴 일은 없지만, 나중에 절이 늘어나도 안전하게).

drop function if exists get_random_quiz_items(integer, text);
create or replace function get_random_quiz_items(p_count integer, p_chapter text default null, p_section text default null)
returns table (
  id uuid,
  type text,
  question jsonb,
  page_title text,
  page_section text
)
language sql
security definer
set search_path = public
stable
as $$
  select qi.id, qi.type, qi.question, wp.title as page_title, wp.section as page_section
  from quiz_items qi
  join wiki_pages wp on wp.id = qi.wiki_page_id
  where (p_chapter is null or wp.section like p_chapter || '장%')
    and (p_section is null or wp.section ~ ('(^|[^0-9])' || p_section || '절'))
  order by random()
  limit p_count;
$$;

-- 006에서 이미 anon까지 열어뒀던 걸 그대로 유지 — 퀴즈 "풀이"는 비로그인도 가능해야 하므로.
grant execute on function get_random_quiz_items(integer, text, text) to anon, authenticated;

drop function if exists get_due_review_items(integer, text);
create or replace function get_due_review_items(p_count integer, p_chapter text default null, p_section text default null)
returns table (
  id uuid,
  type text,
  question jsonb,
  page_title text,
  page_section text,
  next_review_at date,
  repetitions integer
)
language sql
security invoker
stable
as $$
  with latest_attempt as (
    select distinct on (quiz_item_id)
      quiz_item_id, next_review_at, repetitions
    from quiz_attempts
    where user_id = auth.uid()
    order by quiz_item_id, attempted_at desc
  )
  select
    qi.id, qi.type, qi.question, wp.title as page_title, wp.section as page_section,
    coalesce(la.next_review_at, current_date) as next_review_at,
    coalesce(la.repetitions, 0) as repetitions
  from quiz_items qi
  join wiki_pages wp on wp.id = qi.wiki_page_id
  left join latest_attempt la on la.quiz_item_id = qi.id
  where qi.user_id = auth.uid()
    and coalesce(la.next_review_at, current_date) <= current_date
    and (p_chapter is null or wp.section like p_chapter || '장%')
    and (p_section is null or wp.section ~ ('(^|[^0-9])' || p_section || '절'))
  order by coalesce(la.next_review_at, current_date) asc, random()
  limit p_count;
$$;

grant execute on function get_due_review_items(integer, text, text) to authenticated;

drop function if exists count_due_review_items(text);
create or replace function count_due_review_items(p_chapter text default null, p_section text default null)
returns integer
language sql
security invoker
stable
as $$
  with latest_attempt as (
    select distinct on (quiz_item_id)
      quiz_item_id, next_review_at
    from quiz_attempts
    where user_id = auth.uid()
    order by quiz_item_id, attempted_at desc
  )
  select count(*)::integer
  from quiz_items qi
  join wiki_pages wp on wp.id = qi.wiki_page_id
  left join latest_attempt la on la.quiz_item_id = qi.id
  where qi.user_id = auth.uid()
    and coalesce(la.next_review_at, current_date) <= current_date
    and (p_chapter is null or wp.section like p_chapter || '장%')
    and (p_section is null or wp.section ~ ('(^|[^0-9])' || p_section || '절'));
$$;

grant execute on function count_due_review_items(text, text) to authenticated;
