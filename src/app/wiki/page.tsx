// Phase 5: 위키 열람 UI — 목록/검색.
// 챕터를 고르거나 검색어를 입력해야 목록이 뜬다 (1104개를 한 번에 다 보여주면 느리고 압도적이라서).
//
// 디자인 라운드: 시안(Main.dc.html)의 좌측 장별 목차 + 검색 히어로 + 우측 문서 카드 레이아웃을
// 그대로 옮겼다. 필터가 없으면 아무것도 안 보여주는 기존 동작은 그대로 두고, 그 안내 문구만
// 카드 형태로 다시 그렸다.
//
// 위키 확장 미리보기 라운드: 결과 카드를 클릭하면 바로 문서로 이동하던 걸, 클릭하면 카드가 펼쳐져서
// 정의·포인트를 먼저 보여주고 "자세히 보기"를 눌러야 이동하는 방식(WikiResultCard)으로 바꿨다.
// 그래서 목록 조회에 points도 같이 select한다(펼칠 때 추가 조회 없이 바로 보여주기 위해).
//
// AI 에이전트 라운드: 이 목록 페이지에도 위젯을 띄운다(특정 문서 context 없이 일반 대화 모드).
// 로그인 여부에 따라 위젯 내용이 달라져서 user를 새로 조회한다(기존에는 이 페이지가 로그인 여부를
// 신경 쓰지 않았다 — 열람 자체는 비로그인도 가능하므로 이 조회를 추가해도 접근 제한은 그대로다).
//
// 위키 미리보기 확장 라운드(2차, 수정): 카드를 펼칠 때마다 GET /api/wiki/pages/[id]로 그때그때
// 관련 문서·역링크를 불러왔더니 0.5~1초씩 눈에 띄게 느려졌다(매번 새 네트워크 왕복). 그래서
// 화면에 뜬 결과(최대 300개) 전체에 대해 wiki_links를 딱 2번(나가는 링크·들어오는 링크 각각)만
// 일괄 조회하고, 거기 걸린 문서들의 정보를 wiki_pages에서 한 번 더 일괄 조회해서, 결과 하나하나에
// 이미 계산된 관련 문서·역링크를 붙여서 내려준다 — 정의·포인트처럼 목록 조회 시점에 다 갖고 있어서
// 카드를 펼칠 때 추가 요청이 전혀 없다(즉시 반응). 문서 1104개를 매번 다 훑던 장별 개수 집계보다도
// 가벼운 조회다(최대 300개로 범위가 좁혀진 상태에서만 도는 쿼리라서).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import { CHAPTER_LABELS as CHAPTERS } from "@/lib/chapters";
import WikiResultCard, { type WikiResultDoc } from "./WikiResultCard";
import { type RelatedDoc } from "./[id]/RelatedDocsPanel";
import AgentChatWidget from "../AgentChatWidget";

export default async function WikiListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chapter?: string }>;
}) {
  const { q, chapter } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PostgREST 기본 최대 1000행 한도(문서 1104개라 초과)를 넘겨 전체를 다 가져와야
  // 장별 개수·전체 개수가 정확하다 — .range() 없이 select만 하면 6장이 잘려서 안 보이던 버그가 있었다.
  const { data: chapterCounts } = await fetchAllRows<{ section: string }>(supabase, "wiki_pages", "section");
  const countsByChapter = new Map<string, number>();
  for (const row of chapterCounts ?? []) {
    const m = row.section?.match(/^(\d+)장/);
    if (!m) continue;
    countsByChapter.set(m[1], (countsByChapter.get(m[1]) ?? 0) + 1);
  }
  const totalCount = chapterCounts?.length ?? 0;

  let results: WikiResultDoc[] = [];
  const hasFilter = Boolean(q?.trim()) || Boolean(chapter);

  if (hasFilter) {
    let query = supabase
      .from("wiki_pages")
      .select("id, title, section, definition, points, flagged")
      .order("section", { ascending: true });
    if (q?.trim()) {
      query = query.ilike("search_text", `%${q.trim()}%`);
    }
    if (chapter) {
      query = query.ilike("section", `${chapter}장%`);
    }
    const { data } = await query.limit(300);
    results = (data ?? []).map((row) => ({
      ...row,
      points: Array.isArray(row.points) ? (row.points as string[]) : [],
    }));
  }

  // 결과에 뜬 문서들의 관련 문서·역링크를 한꺼번에 조회한다(카드마다 따로 부르지 않는다 — 위 설명 참고).
  const outgoingByDocId = new Map<string, RelatedDoc[]>();
  const backlinksByDocId = new Map<string, RelatedDoc[]>();

  if (results.length > 0) {
    const resultIds = results.map((r) => r.id);

    type LinkEdge = { from_page_id: string; to_page_id: string };
    const [{ data: outgoingEdges }, { data: backlinkEdges }] = await Promise.all([
      supabase.from("wiki_links").select("from_page_id, to_page_id").in("from_page_id", resultIds),
      supabase.from("wiki_links").select("from_page_id, to_page_id").in("to_page_id", resultIds),
    ]);

    const edgesOut = (outgoingEdges ?? []) as LinkEdge[];
    const edgesIn = (backlinkEdges ?? []) as LinkEdge[];

    const neededIds = new Set<string>();
    edgesOut.forEach((e) => neededIds.add(e.to_page_id));
    edgesIn.forEach((e) => neededIds.add(e.from_page_id));

    if (neededIds.size > 0) {
      const { data: linkedDocsRaw } = await supabase
        .from("wiki_pages")
        .select("id, title, section, definition, points, flagged")
        .in("id", [...neededIds]);

      const docsById = new Map<string, RelatedDoc>();
      for (const d of linkedDocsRaw ?? []) {
        docsById.set(d.id, { ...d, points: Array.isArray(d.points) ? (d.points as string[]) : [] });
      }

      for (const e of edgesOut) {
        const target = docsById.get(e.to_page_id);
        if (!target) continue;
        if (!outgoingByDocId.has(e.from_page_id)) outgoingByDocId.set(e.from_page_id, []);
        outgoingByDocId.get(e.from_page_id)!.push(target);
      }
      for (const e of edgesIn) {
        const source = docsById.get(e.from_page_id);
        if (!source) continue;
        if (!backlinksByDocId.has(e.to_page_id)) backlinksByDocId.set(e.to_page_id, []);
        backlinksByDocId.get(e.to_page_id)!.push(source);
      }
    }
  }

  const activeChapterLabel = CHAPTERS.find((c) => c.num === chapter)?.label;

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <section style={{ padding: "40px 40px 24px", maxWidth: 1200, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, margin: "0 0 6px", color: COLORS.text }}>
          무엇을 찾고 계신가요?
        </h1>
        <p style={{ fontSize: 14, color: COLORS.textFaint, margin: "0 0 18px" }}>
          전체 {totalCount}개 문서를 제목·본문으로 검색하거나, 장을 골라 둘러보세요.
        </p>
        <form method="get" style={{ maxWidth: 620 }}>
          <div style={{ position: "relative" }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <circle cx="8" cy="8" r="6" stroke={COLORS.textFainter} strokeWidth="1.8" />
              <path d="M12.5 12.5L16 16" stroke={COLORS.textFainter} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="검색어 입력 (제목·본문)"
              style={{
                width: "100%",
                padding: "13px 16px 13px 44px",
                fontSize: 14.5,
                borderRadius: 12,
                border: `1.5px solid ${COLORS.border}`,
                boxSizing: "border-box",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          {chapter && <input type="hidden" name="chapter" value={chapter} />}
        </form>
      </section>

      <section
        style={{
          padding: "0 40px 60px",
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          display: "flex",
          gap: 40,
          alignItems: "flex-start",
        }}
      >
        <aside style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textFainter, letterSpacing: 0.4, padding: "0 12px 8px" }}>
            장별 목차
          </div>
          {CHAPTERS.map((ch) => {
            const active = chapter === ch.num;
            return (
              <Link
                key={ch.num}
                href={q?.trim() ? `/wiki?chapter=${ch.num}&q=${encodeURIComponent(q.trim())}` : `/wiki?chapter=${ch.num}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 999,
                  background: active ? COLORS.red : "transparent",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: active ? "rgba(255,255,255,0.25)" : COLORS.chipBg,
                    color: active ? "#fff" : COLORS.textFaint,
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {ch.num}
                </span>
                <span style={{ fontSize: 13.5, color: active ? "#fff" : COLORS.textMuted, fontWeight: active ? 700 : 400, flex: 1 }}>
                  {ch.label}
                </span>
                <span style={{ fontSize: 11.5, color: active ? "rgba(255,255,255,0.85)" : COLORS.textFainter }}>
                  {countsByChapter.get(ch.num) ?? 0}
                </span>
              </Link>
            );
          })}
          {chapter && (
            <Link
              href={q?.trim() ? `/wiki?q=${encodeURIComponent(q.trim())}` : "/wiki"}
              style={{ fontSize: 12.5, color: COLORS.textFaint, padding: "8px 12px", textDecoration: "none" }}
            >
              장 선택 해제 ✕
            </Link>
          )}
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {hasFilter && (
            <div style={{ fontSize: 13.5, color: COLORS.textFaint, marginBottom: 4 }}>
              {chapter ? `${chapter}장 · ${activeChapterLabel}` : "전체"}
              {q?.trim() ? ` · "${q.trim()}" 검색 결과` : ""} — {results.length}개 문서
            </div>
          )}

          {!hasFilter && (
            <div
              style={{
                padding: "32px 24px",
                borderRadius: 14,
                border: `1px dashed ${COLORS.border}`,
                textAlign: "center",
                color: COLORS.textFaint,
                fontSize: 13.5,
              }}
            >
              검색어를 입력하거나 왼쪽에서 장을 골라보세요.
            </div>
          )}

          {hasFilter && results.length === 0 && (
            <div
              style={{
                padding: "32px 24px",
                borderRadius: 14,
                border: `1px dashed ${COLORS.border}`,
                textAlign: "center",
                color: COLORS.textFaint,
                fontSize: 13.5,
              }}
            >
              결과가 없어요.
            </div>
          )}

          {results.map((doc) => (
            <WikiResultCard
              key={doc.id}
              doc={doc}
              outgoing={outgoingByDocId.get(doc.id) ?? []}
              backlinks={backlinksByDocId.get(doc.id) ?? []}
            />
          ))}
        </div>
      </section>

      <AgentChatWidget loggedIn={Boolean(user)} />
    </div>
  );
}
