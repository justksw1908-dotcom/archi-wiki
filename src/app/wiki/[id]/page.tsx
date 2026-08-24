// Phase 5: 위키 열람 UI — 문서 상세. 관련 문서(나가는 링크)와 역링크(들어오는 링크)를 같이 보여주고,
// AI가 잘못 정리한 내용을 고칠 수 있는 최소한의 수동 편집 기능을 제공한다.
//
// Phase 10 (로드맵 이후 추가 요청): 이 페이지 자체는 로그인 없이도 열람 가능(src/lib/supabase/middleware.ts,
// wiki_pages/wiki_links의 public select RLS 정책 참고). 편집 폼은 로그인했을 때만 보여준다 —
// 어차피 저장 API(PATCH /api/wiki/pages/[id])가 서버에서 다시 로그인을 확인해서 막지만,
// 비로그인 사용자에게 눌러도 실패할 편집 버튼을 애초에 안 보여주는 게 자연스럽다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditPageForm from "./EditPageForm";

type LinkedDoc = { id: string; title: string; section: string };

export default async function WikiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("wiki_pages")
    .select("id, section, title, definition, points, flagged, updated_at")
    .eq("id", id)
    .single();

  if (!doc) notFound();

  const { data: outgoingLinkRows } = await supabase.from("wiki_links").select("to_page_id").eq("from_page_id", id);
  const { data: backlinkRows } = await supabase.from("wiki_links").select("from_page_id").eq("to_page_id", id);

  const outgoingIds = (outgoingLinkRows ?? []).map((r) => r.to_page_id);
  const backlinkIds = (backlinkRows ?? []).map((r) => r.from_page_id);

  const [{ data: outgoingDocs }, { data: backlinkDocs }] = await Promise.all([
    outgoingIds.length
      ? supabase.from("wiki_pages").select("id, title, section").in("id", outgoingIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
    backlinkIds.length
      ? supabase.from("wiki_pages").select("id, title, section").in("id", backlinkIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
  ]);

  const points: string[] = Array.isArray(doc.points) ? doc.points : [];

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <Link href="/wiki" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>
        ← 위키 목록
      </Link>

      <div style={{ marginTop: 12, marginBottom: 4, fontSize: 12, color: "#999" }}>{doc.section}</div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>
        {doc.flagged && <span style={{ color: "#B45B45" }}>⚠ </span>}
        {doc.title}
      </h1>

      <p style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 16 }}>{doc.definition}</p>

      {points.length > 0 && (
        <ul style={{ paddingLeft: 20, marginBottom: 24, fontSize: 14, lineHeight: 1.8 }}>
          {points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>관련 문서 ({outgoingDocs?.length ?? 0})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(outgoingDocs ?? []).map((d) => (
              <Link key={d.id} href={`/wiki/${d.id}`} style={{ fontSize: 13.5, color: "#3A5A9C", textDecoration: "none" }}>
                {d.title}
              </Link>
            ))}
            {(!outgoingDocs || outgoingDocs.length === 0) && <span style={{ fontSize: 13, color: "#bbb" }}>없음</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>이 문서를 참조하는 문서 ({backlinkDocs?.length ?? 0})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(backlinkDocs ?? []).map((d) => (
              <Link key={d.id} href={`/wiki/${d.id}`} style={{ fontSize: 13.5, color: "#3A5A9C", textDecoration: "none" }}>
                {d.title}
              </Link>
            ))}
            {(!backlinkDocs || backlinkDocs.length === 0) && <span style={{ fontSize: 13, color: "#bbb" }}>없음</span>}
          </div>
        </div>
      </div>

      {user ? (
        <EditPageForm
          pageId={doc.id}
          initial={{
            section: doc.section,
            title: doc.title,
            definition: doc.definition,
            points,
            flagged: doc.flagged,
            links: (outgoingDocs ?? []).map((d) => d.title),
          }}
        />
      ) : (
        <p style={{ fontSize: 13, color: "#999" }}>
          <Link href="/login" style={{ color: "#3A5A9C", textDecoration: "none" }}>
            로그인
          </Link>
          하면 이 문서를 편집할 수 있어요.
        </p>
      )}
    </div>
  );
}
