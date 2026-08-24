// Phase 5: 위키 열람 UI — 목록/검색.
// 챕터를 고르거나 검색어를 입력해야 목록이 뜬다 (1104개를 한 번에 다 보여주면 느리고 압도적이라서).
//
// 디자인 라운드: 시안(Main.dc.html)의 좌측 장별 목차 + 검색 히어로 + 우측 문서 카드 레이아웃을
// 그대로 옮겼다. 필터가 없으면 아무것도 안 보여주는 기존 동작은 그대로 두고, 그 안내 문구만
// 카드 형태로 다시 그렸다.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { COLORS, FONT_FAMILY } from "@/lib/theme";

const CHAPTERS = [
  { num: "0", label: "총론" },
  { num: "1", label: "시공계획" },
  { num: "2", label: "철근콘크리트공사" },
  { num: "3", label: "가설공사" },
  { num: "4", label: "철골공사" },
  { num: "5", label: "마감공사" },
  { num: "6", label: "공정·품질·안전" },
];

export default async function WikiListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chapter?: string }>;
}) {
  const { q, chapter } = await searchParams;
  const supabase = await createClient();

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

  let results: { id: string; title: string; section: string; definition: string; flagged: boolean }[] = [];
  const hasFilter = Boolean(q?.trim()) || Boolean(chapter);

  if (hasFilter) {
    let query = supabase.from("wiki_pages").select("id, title, section, definition, flagged").order("section", { ascending: true });
    if (q?.trim()) {
      query = query.ilike("search_text", `%${q.trim()}%`);
    }
    if (chapter) {
      query = query.ilike("section", `${chapter}장%`);
    }
    const { data } = await query.limit(300);
    results = data ?? [];
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
            <Link
              key={doc.id}
              href={`/wiki/${doc.id}`}
              style={{
                display: "block",
                padding: "16px 20px",
                borderRadius: 14,
                border: `1px solid ${COLORS.border}`,
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                  {doc.flagged && <span style={{ color: COLORS.orange }}>⚠ </span>}
                  {doc.title}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: COLORS.textFaint,
                    background: COLORS.chipBg,
                    padding: "2px 8px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.section}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textFaint,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.definition}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
