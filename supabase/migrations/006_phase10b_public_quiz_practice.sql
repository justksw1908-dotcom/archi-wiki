-- Phase 10 후속 (로드맵 이후 추가 요청): 퀴즈 "풀이"도 로그인 없이 가능하게 한다.
-- 막는 건 여전히 "생성"(AI로 새 문제 만들기)뿐이다 — 그건 API 라우트 자체의 로그인 확인과
-- 접근 제어 미들웨어에서 그대로 막아두므로 이 마이그레이션과는 무관하다.
--
-- get_random_quiz_items()는 원래 "security invoker" + "qi.user_id = auth.uid()" 조건이 있어서,
-- 비로그인(anon) 사용자가 부르면 auth.uid()가 NULL이라 무조건 0건이 나오고, 애초에 실행 권한도
-- authenticated에게만 있어서 호출 자체가 permission denied였다. 이 앱은 사용자가 한 명뿐이라
-- "이 문제가 누구 것인지" 구분이 의미가 없으므로, 아예 그 조건을 없애고(=이 함수를 부르면 누구든
-- 같은 문제 풀을 무작위로 받는다) "security definer"로 바꿔서 실행 권한을 anon에게도 준다.
--
-- 정답(answer/answer_variants)은 이 함수가 원래도 안 내려주므로(question 컬럼만 반환) 그 부분은
-- 그대로다 — 채점은 여전히 서버(/api/quiz/attempts)가 별도로 처리한다.
create or replace function get_random_quiz_items(p_count integer, p_chapter text default null)
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
  order by random()
  limit p_count;
$$;

grant execute on function get_random_quiz_items(integer, text) to anon, authenticated;
