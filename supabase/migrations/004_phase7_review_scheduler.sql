-- Phase 7 마이그레이션 — 망각곡선(SM-2) 복습 스케줄러.
-- schema.sql · 002 · 003을 이미 실행했다면 이 파일만 추가로 실행하세요.
--
-- SM-2 계산 자체는 AI를 쓰지 않는 순수 코드(src/lib/sm2.ts, /api/quiz/attempts)에서 하고,
-- 여기 SQL 함수들은 "오늘 복습할 문제 찾기"만 담당한다. quiz_attempts는 시도할 때마다
-- 한 줄씩 쌓이는 로그 표라, 문제 하나의 "현재" SM-2 상태 = 그 문제의 가장 최근 시도 행
-- (attempted_at 최신)의 값이다 — DISTINCT ON으로 문제별 최신 행만 뽑는다.
-- 아직 한 번도 안 푼 문제는 시도 행이 없으니, next_review_at을 오늘로 간주해서
-- (quiz_attempts 표의 next_review_at 기본값 자체가 current_date인 것과 같은 의미) 바로
-- 복습 대상에 포함시킨다.
--
-- get_random_quiz_items와 마찬가지로 DB 함수로 만든 이유: 문서가 1104개나 되다 보니 "이 조건에
-- 맞는 것들" 같은 걸 앱 코드에서 큰 목록으로 처리하면 느리고 요청이 길어질 수 있어서, Postgres
-- 쪽에서 인덱스를 타며 한 번에 처리한다.

grant usage on schema auth to authenticated;

create or replace function get_due_review_items(p_count integer, p_chapter text default null)
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
  order by coalesce(la.next_review_at, current_date) asc, random()
  limit p_count;
$$;

grant execute on function get_due_review_items(integer, text) to authenticated;

-- 퀴즈 허브에 "오늘 N개 복습 예정" 뱃지를 띄우기 위한 가벼운 카운트 전용 함수 —
-- 문제 본문까지 다 안 가져오고 개수만 세도록 분리했다.
create or replace function count_due_review_items(p_chapter text default null)
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
    and (p_chapter is null or wp.section like p_chapter || '장%');
$$;

grant execute on function count_due_review_items(text) to authenticated;
