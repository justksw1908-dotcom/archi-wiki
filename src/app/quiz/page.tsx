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
// 디자인 라운드: 붉은/주황 톤 + 카드형 구성으로 다시 그리면서, 예전에 따로 쓰던 파란색·초록색·보라색
// 강조색은 전부 브랜드 컬러(red/orange)로 통일했다. 정답/오답 같은 의미가 있는 색만 별도로 남겨뒀다.
//
// 퀴즈 절 선택 라운드: "장뿐 아니라 절 단위로도 골라서 풀 수 있게" 해달라는 요청으로, 장 목록만
// 있던 PracticeLinks를 장/절 아코디언(QuizLinks)으로 바꿨다. 절 목록은 wiki_pages의 section
// 문자열(공개 데이터)에서 뽑는다 — 퀴즈 존재 여부(quiz_items)는 비로그인에겐 안 보이는 데이터라서
// 쓰지 않았고, 예전처럼 "이 범위엔 아직 퀴즈가 없어요" 빈 상태로 자연스럽게 안내한다.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import { CHAPTER_LABELS } from "@/lib/chapters";
import { parseSection } from "@/lib/parse-section";
import QuizLinks, { type ChapterNode } from "./QuizLinks";

async function buildChapterSectionTree(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ChapterNode[]> {
  const { data: sectionRows } = await fetchAllRows<{ section: string }>(supabase, "wiki_pages", "section");
  const chapterMap = new Map<string, Map<string, number>>();
  for (const row of sectionRows ?? []) {
    const { chapter, sectionNum } = parseSection(row.section);
    if (!chapterMap.has(chapter)) chapterMap.set(chapter, new Map());
    const secMap = chapterMap.get(chapter)!;
    secMap.set(sectionNum, (secMap.get(sectionNum) ?? 0) + 1);
  }
  return CHAPTER_LABELS.map(({ num, label }) => ({
    chapter: num,
    label,
    sections: [...(chapterMap.get(num)?.entries() ?? [])]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([sectionNum, count]) => ({ sectionNum, count })),
  }));
}

export default async function QuizHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 여부와 상관없이 필요해서(장/절 트리는 위키 문서 자체가 출처라 공개 데이터) 분기 앞에서 조회.
  const tree = await buildChapterSectionTree(supabase);

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
        <QuizLinks
          tree={tree}
          basePath="/quiz/practice"
          title="퀴즈 풀기"
          allLabel="전체에서 풀기"
          hint="한 번에 최대 10문제씩 무작위로 나와요."
        />
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
  const { data: dueCount } = await supabase.rpc("count_due_review_items", { p_chapter: null, p_section: null });
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

      <div style={{ marginBottom: 32 }}>
        <QuizLinks
          tree={tree}
          basePath="/quiz/review"
          title="장 · 절 골라서 복습"
          allLabel="오늘 복습 전체"
          hint="선택한 범위 안에서 오늘 복습 일정인 문제만 나와요."
        />
      </div>

      <QuizLinks
        tree={tree}
        basePath="/quiz/practice"
        title="퀴즈 풀기"
        allLabel="전체에서 풀기"
        hint="한 번에 최대 10문제씩 무작위로 나와요."
      />
    </div>
  );
}
