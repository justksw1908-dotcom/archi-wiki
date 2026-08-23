// Phase 5: 위키 열람 UI — 목록/검색.
// 챕터를 고르거나 검색어를 입력해야 목록이 뜬다 (1104개를 한 번에 다 보여주면 느리고 압도적이라서).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";

const CHAPTERS = ["0", "1", "2", "3", "4", "5", "6"];

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

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>위키</h1>
        <span style={{ fontSize: 13, color: "#888" }}>전체 {totalCount}개 문서</span>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>제목·본문으로 검색하거나 장을 골라보세요.</p>

      <form method="get" style={{ marginBottom: 16 }}>
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="검색어 입력 (제목·본문)"
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
        />
        {chapter && <input type="hidden" name="chapter" value={chapter} />}
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {CHAPTERS.map((ch) => (
          <Link
            key={ch}
            href={q?.trim() ? `/wiki?chapter=${ch}&q=${encodeURIComponent(q.trim())}` : `/wiki?chapter=${ch}`}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 999,
              border: `1px solid ${chapter === ch ? "#4C6A99" : "#ccc"}`,
              background: chapter === ch ? "#E7EEF8" : "#fff",
              color: "#333",
              textDecoration: "none",
            }}
          >
            {ch}장 ({countsByChapter.get(ch) ?? 0})
          </Link>
        ))}
        {chapter && (
          <Link
            href={q?.trim() ? `/wiki?q=${encodeURIComponent(q.trim())}` : "/wiki"}
            style={{ padding: "6px 12px", fontSize: 13, borderRadius: 999, border: "1px solid #ccc", color: "#888", textDecoration: "none" }}
          >
            장 선택 해제 ✕
          </Link>
        )}
      </div>

      {!hasFilter && (
        <p style={{ color: "#999", fontSize: 13.5 }}>검색어를 입력하거나 위에서 장을 골라보세요.</p>
      )}

      {hasFilter && results.length === 0 && <p style={{ color: "#999", fontSize: 13.5 }}>결과가 없어요.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {results.map((doc) => (
          <Link
            key={doc.id}
            href={`/wiki/${doc.id}`}
            style={{
              display: "block",
              padding: "10px 12px",
              borderRadius: 6,
              textDecoration: "none",
              color: "#222",
              border: "1px solid transparent",
            }}
          >
            <div style={{ fontSize: 11, color: "#999" }}>{doc.section}</div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>
              {doc.flagged && <span style={{ color: "#B45B45" }}>⚠ </span>}
              {doc.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#666",
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
    </div>
  );
}
