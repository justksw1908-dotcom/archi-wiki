// Phase 6: 퀴즈 풀기 페이지 진입점. searchParams만 서버에서 읽어 클라이언트 컴포넌트로 넘긴다.
import PracticeClient from "./PracticeClient";

export default async function QuizPracticePage({ searchParams }: { searchParams: Promise<{ chapter?: string }> }) {
  const { chapter } = await searchParams;
  return <PracticeClient chapter={chapter ?? null} />;
}
