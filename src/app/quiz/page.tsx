// Phase 6/7 (수정): 퀴즈 허브 — 생성 현황, 오늘의 복습, 퀴즈 풀기 시작점.
// 예전엔 여기서 바로 "AI로 퀴즈 생성 시작"(전체 일괄) 버튼을 눌렀지만, 할당량 문제로
// 장/절/문서 단위로 범위를 고르는 /quiz/select 화면으로 안내하도록 바꿨다.
// Phase 7에서 망각곡선(SM-2) 복습이 추가되면서 "오늘 복습할 문제 수"도 같이 보여준다.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";

const CHAPTERS = ["0", "1", "2", "3", "4", "5", "6"];

export default async function QuizHubPage() {
  const supabase = await createClient();

  const { count: totalPages } = await supabase.from("wiki_pages").select("id", { count: "exact", head: true });
  // count:"exact",head:true는 PostgREST 1000행 한도와 무관하게 정확한 개수를 주지만(집계 쿼리라서),
  // "문서별로 중복 제거한 개수"가 필요한 아래 값은 실제 행을 다 가져와야 해서 fetchAllRows로 처리한다
  // (문서당 문항이 여러 개라 quiz_items 행 수가 결국 1000을 넘을 수 있다).
  const { data: quizPageRows } = await fetchAllRows<{ wiki_page_id: string }>(supabase, "quiz_items", "wiki_page_id");
  const pagesWithQuiz = new Set((quizPageRows ?? []).map((r) => r.wiki_page_id)).size;
  const { count: totalQuizItems } = await supabase.from("quiz_items").select("id", { count: "exact", head: true });
  const { count: totalAttempts } = await supabase.from("quiz_attempts").select("id", { count: "exact", head: true });
  // 카운트만 필요해서 DB 함수(count_due_review_items)로 가볍게 물어본다 — 문제 본문까지 다 안 가져옴.
  const { data: dueCount } = await supabase.rpc("count_due_review_items", { p_chapter: null });

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>퀴즈</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        위키 문서 {totalPages ?? 0}개 중 {pagesWithQuiz}개에 퀴즈가 있어요 (총 {totalQuizItems ?? 0}문항, 지금까지 {totalAttempts ?? 0}번 풀었어요).
      </p>

      <div style={{ marginBottom: 32 }}>
        <Link
          href="/quiz/select"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #4C8A6A",
            background: "#E1EEE9",
            color: "#333",
            textDecoration: "none",
          }}
        >
          장 · 절 · 문서 골라서 퀴즈 생성
        </Link>
      </div>

      <div
        style={{
          marginBottom: 24,
          padding: "14px 16px",
          borderRadius: 10,
          border: "1px solid #D8CBE8",
          background: "#F1ECF8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>오늘의 복습</div>
          <div style={{ fontSize: 13, color: "#666" }}>
            망각곡선(SM-2) 일정상 오늘 다시 볼 차례인 문제가 {dueCount ?? 0}개예요.
          </div>
        </div>
        <Link
          href="/quiz/review"
          style={{
            padding: "8px 16px",
            fontSize: 13.5,
            borderRadius: 999,
            border: "1px solid #7C5CA8",
            background: (dueCount ?? 0) > 0 ? "#7C5CA8" : "#fff",
            color: (dueCount ?? 0) > 0 ? "#fff" : "#7C5CA8",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {(dueCount ?? 0) > 0 ? "복습 시작" : "복습할 문제 없음"}
        </Link>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>퀴즈 풀기</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Link
          href="/quiz/practice"
          style={{ padding: "8px 14px", fontSize: 13.5, borderRadius: 999, border: "1px solid #4C6A99", background: "#E7EEF8", color: "#333", textDecoration: "none" }}
        >
          전체에서 풀기
        </Link>
        {CHAPTERS.map((ch) => (
          <Link
            key={ch}
            href={`/quiz/practice?chapter=${ch}`}
            style={{ padding: "8px 14px", fontSize: 13.5, borderRadius: 999, border: "1px solid #ccc", color: "#333", textDecoration: "none" }}
          >
            {ch}장
          </Link>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "#999" }}>한 번에 최대 10문제씩 무작위로 나와요.</p>
    </div>
  );
}
