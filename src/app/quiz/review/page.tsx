// Phase 7: 복습 페이지 진입점. searchParams만 서버에서 읽어 클라이언트 컴포넌트로 넘긴다.
// 퀴즈 절 선택 라운드: section도 같이 읽어서 넘긴다(장 없이 절만 오면 무시하도록 클라이언트에서 처리).
import ReviewClient from "./ReviewClient";

export default async function QuizReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; section?: string }>;
}) {
  const { chapter, section } = await searchParams;
  return <ReviewClient chapter={chapter ?? null} section={chapter ? section ?? null : null} />;
}
