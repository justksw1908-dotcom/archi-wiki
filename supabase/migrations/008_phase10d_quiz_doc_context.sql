-- AI 에이전트 확장 라운드(퀴즈도 문서 인식형으로) — 퀴즈를 풀 때도 위젯이 지금 보고 있는 문제가
-- 속한 위키 문서의 정의·포인트를 참고해서 답할 수 있도록, 문제 조회 함수 2개(연습·복습)가 이제
-- wiki_pages의 definition·points도 같이 내려준다. 정답(answer) 컬럼은 여전히 안 내려준다 —
-- definition·points는 애초에 /wiki/[id]에서 로그인 없이도 누구나 보는 공개 정보라서, 이걸 채팅
-- 맥락으로 준다고 새로 뭔가 더 노출되는 건 아니다(객관식 정답 자체는 여전히 별도 컬럼이라 안 섞여 나옴).
--
-- schema.sql · 002~007을 이미 실행했다면 이 파일만 추가로 실행하세요.
drop function if exists get_random_quiz_items(integer, text, text);
create or replace function get_random_quiz_items(p_count integer, p_chapter text default null, p_section text default null)
returns table (
  id uuid,
  type text,
  question jsonb,
  page_title text,
  page_section text,
  page_definition text,
  page_points jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    qi.id, qi.type, qi.question,
    wp.title as page_title, wp.section as page_section,
    wp.definition as page_definition, wp.points as page_points
  from quiz_items qi
  join wiki_pages wp on wp.id = qi.wiki_page_id
  where (p_chapter is null or wp.section like p_chapter || '장%')
    and (p_section is null or wp.section ~ ('(^|[^0-9])' || p_section || '절'))
  order by random()
  limit p_count;
$$;

grant execute on function get_random_quiz_items(integer, text, text) to anon, authenticated;

drop function if exists get_due_review_items(integer, text, text);
create or replace function get_due_review_items(p_count integer, p_chapter text default null, p_section text default null)
returns table (
  id uuid,
  type text,
  question jsonb,
  page_title text,
  page_section text,
  page_definition text,
  page_points jsonb,
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
    qi.id, qi.type, qi.question,
    wp.title as page_title, wp.section as page_section,
    wp.definition as page_definition, wp.points as page_points,
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
