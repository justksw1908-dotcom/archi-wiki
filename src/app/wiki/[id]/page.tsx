// Phase 5: 위키 열람 UI — 문서 상세. 관련 문서(나가는 링크)와 역링크(들어오는 링크)를 같이 보여주고,
// AI가 잘못 정리한 내용을 고칠 수 있는 최소한의 수동 편집 기능을 제공한다.
//
// Phase 10 (로드맵 이후 추가 요청): 이 페이지 자체는 로그인 없이도 열람 가능(src/lib/supabase/middleware.ts,
// wiki_pages/wiki_links의 public select RLS 정책 참고). 편집 폼은 로그인했을 때만 보여준다 —
// 어차피 저장 API(PATCH /api/wiki/pages/[id])가 서버에서 다시 로그인을 확인해서 막지만,
// 비로그인 사용자에게 눌러도 실패할 편집 버튼을 애초에 안 보여주는 게 자연스럽다.
//
// 디자인 라운드: 시안(WikiDetail.dc.html)의 브레드크럼 · 제목+분류 배지 · 정의 · 포인트 · 관련 문서
// 칩 · 역링크 카드 구성을 옮겼다. 시안의 우측 보조 패널(이 장의 다른 문서 등)은 없는 데이터를
// 새로 조회해야 해서 이번 라운드에서는 빼고, 실제 데이터에 있는 항목만 다시 그렸다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
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
  const chapterMatch = doc.section?.match(/^(\d+)장/);
  const chapterNum = chapterMatch ? chapterMatch[1] : null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <Link href="/wiki" style={{ fontSize: 13, color: COLORS.textFainter, textDecoration: "none" }}>
        ← 위키 목록
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 16, marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.4, margin: 0, color: COLORS.text }}>
          {doc.flagged && <span style={{ color: COLORS.orange }}>⚠ </span>}
          {doc.title}
        </h1>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: COLORS.red,
            background: COLORS.redBg,
            border: `1px solid ${COLORS.redBorder}`,
            padding: "3px 9px",
            borderRadius: 999,
          }}
        >
          {doc.section}
        </span>
      </div>

      <div style={{ marginBottom: 20 }}>
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
          <p style={{ fontSize: 13, color: COLORS.textFaint, margin: 0 }}>
            <Link href="/login" style={{ color: COLORS.red, fontWeight: 700, textDecoration: "none" }}>
              로그인
            </Link>
            하면 이 문서를 편집할 수 있어요.
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.2, margin: "0 0 8px" }}>정의</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.85, whiteSpace: "pre-wrap", color: COLORS.text, margin: 0 }}>
            {doc.definition}
          </p>
        </div>

        {points.length > 0 && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.2, margin: "0 0 8px" }}>
              포인트
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {points.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: COLORS.orange,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {i + 1}
                  </span>
                  <p style={{ fontSize: 14.5, lineHeight: 1.7, color: COLORS.text, margin: 0 }}>{p}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.2, margin: "0 0 12px" }}>
            관련 문서 ({outgoingDocs?.length ?? 0})
          </h2>
          {outgoingDocs && outgoingDocs.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {outgoingDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/wiki/${d.id}`}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13,
                    color: COLORS.textMuted,
                    textDecoration: "none",
                  }}
                >
                  {d.title}
                </Link>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: COLORS.textFainter }}>없음</span>
          )}
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.2, margin: "0 0 12px" }}>
            이 문서를 참조하는 문서 ({backlinkDocs?.length ?? 0})
          </h2>
          {backlinkDocs && backlinkDocs.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {backlinkDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/wiki/${d.id}`}
                  style={{
                    display: "block",
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13.5,
                    color: COLORS.text,
                    textDecoration: "none",
                  }}
                >
                  {d.title}
                </Link>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: COLORS.textFainter }}>없음</span>
          )}
        </div>

        {chapterNum && (
          <Link
            href={`/quiz/practice?chapter=${chapterNum}`}
            style={{
              display: "block",
              padding: "16px 18px",
              borderRadius: 14,
              background: COLORS.redBg,
              border: `1px solid ${COLORS.redBorder}`,
              textDecoration: "none",
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.red, marginBottom: 4 }}>
              {chapterNum}장 문제로 퀴즈 풀어보기 →
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>로그인 없이도 바로 풀 수 있어요.</div>
          </Link>
        )}
      </div>
    </div>
  );
}
