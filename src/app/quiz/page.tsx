// Phase 6/7 (수정): 퀴즈 허브 — 생성 현황, 오늘의 복습, 퀴즈 풀기 시작점.
// 예전엔 여기서 바로 "AI로 퀴즈 생성 시작"(전체 일괄) 버튼을 눌렀지만, 할당량 문제로
// 장/절/문서 단위로 범위를 고르는 /quiz/select 화면으로 안내하도록 바꿨다.
// Phase 7에서 망각곡선(SM-2) 복습이 추가되면서 "오늘 복습할 문제 수"도 같이 보여준다.
//
// Phase 10 후속(로드맵 이후 추가 요청): 이 페이지 자체는 로그인 없이도 볼 수 있다(퀴즈 "풀이"는
// 공개). 다만 생성 현황 통계·"오늘의 복습"·생성 버튼은 전부 로그인한 본인 것이라서(그리고
// quiz_items/quiz_attempts는 anon에게 select 권한을 안 줬으므로 애초에 조회도 안 된다),
// 비로그인일 땐 아예 그 부분을 건너뛰고 "퀴즈 풀기"만 보여준다.
//
// 디자인 라운드: 붉은/주황 톤 + 카드형 구성으로 다시 그리면서, 예전에 따로 쓰던 파란색·보라색
// 강조색은 전부 브랜드 컬러(red/orange)로 통일했다. 정답/오답 같은 의미색은 그대로 남겨둔다.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { COLORS, FONT_FAMILY } from "@/lib/theme";

const CHAPTERS = ["0", "1", "2", "3", "4", "5", "6"];

function PracticeLinks() {
  return (
    <>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>퀴즈 풀기</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Link
          href="/quiz/practice"
          style={{
            padding: "8px 16px",
            fontSize: 13.5,
            fontWeight: 700,
            borderRadius: 999,
            background: COLORS.red,
            color: "#fff",
            textDecoration: "none",
          }}
        >
          전체에서 풀기
        </Link>
        {CHAPTERS.map((ch) => (
          <Link
            key={ch}
            href={`/quiz/practice?chapter=${ch}`}
            style={{
              padding: "8px 16px",
              fontSize: 13.5,
              borderRadius: 999,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted,
              textDecoration: "none",
            }}
          >
            {ch}장
          </Link>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: COLORS.textFainter, margin: 0 }}>한 번에 최대 10문제씩 무작위로 나와요.</p>
    </>
  );
}

export default async function QuizHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginBottom: 8, color: COLORS.text }}>퀴즈</h1>
        <p style={{ color: COLORS.textFaint, fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
          로그인 없이 바로 풀 수 있어요. 결과만 그 자리에서 보여주고 따로 기록은 안 남아요 — 정답/오답 기록과
          복습 일정을 저장하려면{" "}
          <Link href="/login" style={{ color: COLORS.red, fontWeight: 700, textDecoration: "none" }}>
            로그인
          </Link>
          하세요.
        </p>
        <PracticeLinks />
      </div>
    );
  }

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
  const hasDue = (dueCount ?? 0) > 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginBottom: 8, color: COLORS.text }}>퀴즈</h1>
      <p style={{ color: COLORS.textFaint, fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>
        위키 문서 {totalPages ?? 0}개 중 {pagesWithQuiz}개에 퀴즈가 있어요 (총 {totalQuizItems ?? 0}문항, 지금까지{" "}
        {totalAttempts ?? 0}번 풀었어요).
      </p>

      <div style={{ marginBottom: 28 }}>
        <Link
          href="/quiz/select"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 700,
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            background: "#fff",
            color: COLORS.text,
            textDecoration: "none",
          }}
        >
          장 · 절 · 문서 골라서 퀴즈 생성
        </Link>
      </div>

      <div
        style={{
          marginBottom: 28,
          padding: "16px 18px",
          borderRadius: 14,
          border: `1px solid ${hasDue ? COLORS.redBorder : COLORS.border}`,
          background: hasDue ? COLORS.redBg : COLORS.bgSubtle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>오늘의 복습</div>
          <div style={{ fontSize: 13, color: COLORS.textFaint }}>
            망각곡선(SM-2) 일정상 오늘 다시 볼 차례인 문제가 {dueCount ?? 0}개예요.
          </div>
        </div>
        <Link
          href="/quiz/review"
          style={{
            padding: "8px 18px",
            fontSize: 13.5,
            fontWeight: 700,
            borderRadius: 999,
            background: hasDue ? COLORS.red : "#fff",
            border: `1px solid ${hasDue ? COLORS.red : COLORS.border}`,
            color: hasDue ? "#fff" : COLORS.textFaint,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {hasDue ? "복습 시작" : "복습할 문제 없음"}
        </Link>
      </div>

      <PracticeLinks />
    </div>
  );
}
