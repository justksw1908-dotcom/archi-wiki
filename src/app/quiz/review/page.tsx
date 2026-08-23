// Phase 7: 복습 페이지 진입점. searchParams만 서버에서 읽어 클라이언트 컴포넌트로 넘긴다.
import ReviewClient from "./ReviewClient";

export default async function QuizReviewPage({ searchParams }: { searchParams: Promise<{ chapter?: string }> }) {
  const { chapter } = await searchParams;
  return <ReviewClient chapter={chapter ?? null} />;
}
