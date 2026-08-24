// Phase 7: 복습 페이지 진입점. searchParams만 서버에서 읽어 클라이언트 컴포넌트로 넘긴다.
// 퀴즈 절 선택 라운드: section도 같이 읽어서 넘긴다(장 없이 절만 오면 무시하도록 클라이언트에서 처리).
//
// AI 에이전트 확장 라운드: 이 화면은 middleware가 로그인 없인 아예 못 들어오게 막아서(개인 복습
// 기록이라 로그인 필수) 여기 도달했다는 것 자체가 로그인 상태라는 뜻이지만, 다른 화면들과 같은
// 패턴을 유지하려고 실제로 auth.getUser()를 조회해서 넘긴다. 위젯 자체는 ReviewClient 안에서
// 렌더링한다 — 지금 복습 중인 문제가 바뀔 때마다 그 문제가 속한 위키 문서를 context로 넘겨야 해서
// (문서 인식형), 문제 상태를 들고 있는 클라이언트 컴포넌트 쪽에 위젯을 둬야 한다.
import { createClient } from "@/lib/supabase/server";
import ReviewClient from "./ReviewClient";

export default async function QuizReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; section?: string }>;
}) {
  const { chapter, section } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ReviewClient chapter={chapter ?? null} section={chapter ? section ?? null : null} loggedIn={Boolean(user)} />;
}
