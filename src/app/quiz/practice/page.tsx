// Phase 6: 퀴즈 풀기 페이지 진입점. searchParams만 서버에서 읽어 클라이언트 컴포넌트로 넘긴다.
// 퀴즈 절 선택 라운드: section도 같이 읽어서 넘긴다(장 없이 절만 오면 무시하도록 클라이언트에서 처리).
//
// AI 에이전트 확장 라운드: 이 화면은 로그인 없이도 열리므로(middleware의 공개 경로) 로그인 여부를
// 직접 조회해서 넘긴다. 위젯 자체는 PracticeClient 안에서 렌더링한다 — 지금 풀고 있는 문제가 바뀔
// 때마다 그 문제가 속한 위키 문서를 context로 넘겨야 해서(문서 인식형), 문제 상태를 들고 있는
// 클라이언트 컴포넌트 쪽에 위젯을 둬야 한다.
import { createClient } from "@/lib/supabase/server";
import PracticeClient from "./PracticeClient";

export default async function QuizPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; section?: string }>;
}) {
  const { chapter, section } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PracticeClient chapter={chapter ?? null} section={chapter ? section ?? null : null} loggedIn={Boolean(user)} />;
}
