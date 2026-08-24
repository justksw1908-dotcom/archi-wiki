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
//
// 위키 확장 미리보기 라운드: 관련 문서·역링크를 눌러도 바로 이동하지 않고 먼저 내용을 펼쳐 보여주도록
// 바꿨다(RelatedDocsPanel, WikiResultCard) — 그래서 이 두 목록도 definition·points·flagged까지
// 같이 가져온다(문서 하나가 보통 링크를 몇 개~몇십 개만 가지고 있어서 비용이 크지 않다).
//
// AI 에이전트 라운드: 이 문서 페이지의 위젯은 "문서 인식형"이다 — 지금 보고 있는 문서의
// title·section·definition·points를 context로 넘겨서, 에이전트가 이 문서 내용을 참고해 답하게 한다.
//
// 알약 통일 라운드: "이 문서를 참조하는 문서(역링크)"도 관련 문서처럼 알약(칩) 모양으로 보이면 좋겠다는
// 요청으로, 전체 폭 카드(WikiResultCard)를 늘어놓던 방식 대신 관련 문서와 같은 컴포넌트(RelatedDocsPanel)를
// 그대로 재사용한다 — RelatedDoc과 WikiResultDoc은 필드 구성이 완전히 같아서(id/title/section/definition/
// points/flagged) 타입 변환 없이 그대로 넘길 수 있다. 클릭하면 바로 자세히 보기로 이동하지 않고 그 자리에
// 정의·포인트가 펼쳐지는 것도 관련 문서와 동일하게 그대로 유지된다(RelatedDocsPanel이 원래 그렇게 동작함).
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import EditPageForm from "./EditPageForm";
import RelatedDocsPanel, { type RelatedDoc } from "./RelatedDocsPanel";
import AgentChatWidget from "../../AgentChatWidget";

type LinkedDoc = { id: string; title: string; section: string; definition: string; points: string[]; flagged: boolean };

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

  const [{ data: outgoingDocsRaw }, { data: backlinkDocsRaw }] = await Promise.all([
    outgoingIds.length
      ? supabase.from("wiki_pages").select("id, title, section, definition, points, flagged").in("id", outgoingIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
    backlinkIds.length
      ? supabase.from("wiki_pages").select("id, title, section, definition, points, flagged").in("id", backlinkIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
  ]);

  // points가 jsonb라 배열이 아닐 수도 있는 타입으로 내려오므로, 두 목록 다 안전하게 배열로 정규화한다.
  const outgoingDocs: RelatedDoc[] = (outgoingDocsRaw ?? []).map((d) => ({
    ...d,
    points: Array.isArray(d.points) ? (d.points as string[]) : [],
  }));
  const backlinkDocs: RelatedDoc[] = (backlinkDocsRaw ?? []).map((d) => ({
    ...d,
    points: Array.isArray(d.points) ? (d.points as string[]) : [],
  }));

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
            관련 문서 ({outgoingDocs.length})
          </h2>
          <RelatedDocsPanel docs={outgoingDocs} />
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.2, margin: "0 0 12px" }}>
            이 문서를 참조하는 문서 ({backlinkDocs.length})
          </h2>
          <RelatedDocsPanel docs={backlinkDocs} />
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

      <AgentChatWidget
        loggedIn={Boolean(user)}
        context={{ title: doc.title, section: doc.section, definition: doc.definition, points }}
      />
    </div>
  );
}
