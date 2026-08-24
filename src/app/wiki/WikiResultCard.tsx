"use client";

// 위키 확장 미리보기 라운드: "개념을 클릭하면 바로 페이지 이동되기보다는, 칸이 늘어나면서 먼저
// 세부 내용을 보여주고, 그걸로도 모자랄 때 '자세히 보기' 버튼으로 이동하는 형식이 좋겠다"는 요청.
// 그래서 카드 자체는 더 이상 <Link>가 아니라 클릭하면 펼쳐지는 <button>이고, 실제 페이지 이동은
// 펼쳐진 안의 "자세히 보기" 링크로만 한다. 정의·포인트는 이미 목록 조회에서 같이 받아온 걸 그대로
// 보여주므로 펼칠 때 추가 네트워크 요청은 없다.
//
// 위키 미리보기 확장 라운드(2차): "자세히 보기(상세 페이지)에서 같이 나오는 관련 문서·역링크
// 알약도 이 펼침 안에 같이 나왔으면 좋겠다"는 요청으로, 펼칠 때 그 문서의 관련 문서·역링크를
// GET /api/wiki/pages/[id]로 지연 조회해서 같이 보여준다(목록에 있는 문서 전부를 미리 조회하면
// 낭비라서, 실제로 펼친 카드에 대해서만 그때 한 번 불러온다 — 이미 불러온 뒤엔 다시 접었다 펴도
// 재조회하지 않는다). 알약 UI는 상세 페이지와 똑같이 RelatedDocsPanel을 그대로 재사용해서, 알약을
// 눌러도 바로 이동하지 않고 그 자리에 미리보기가 펼쳐지는 동작까지 동일하게 유지된다.
import Link from "next/link";
import { useState } from "react";
import { COLORS } from "@/lib/theme";
import RelatedDocsPanel, { type RelatedDoc } from "./[id]/RelatedDocsPanel";

export type WikiResultDoc = {
  id: string;
  title: string;
  section: string;
  definition: string;
  points: string[];
  flagged: boolean;
};

type LinksState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; outgoing: RelatedDoc[]; backlinks: RelatedDoc[] };

export default function WikiResultCard({ doc }: { doc: WikiResultDoc }) {
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<LinksState>({ status: "idle" });

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && links.status === "idle") {
      setLinks({ status: "loading" });
      fetch(`/api/wiki/pages/${doc.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok) throw new Error(data.message ?? "불러오기 실패");
          setLinks({ status: "loaded", outgoing: data.outgoing ?? [], backlinks: data.backlinks ?? [] });
        })
        .catch(() => setLinks({ status: "error" }));
    }
  }

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
      <button
        onClick={toggle}
        style={{
          display: "block",
          width: "100%",
          padding: "16px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, flex: 1 }}>
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
              flexShrink: 0,
            }}
          >
            {doc.section}
          </span>
          <span style={{ color: COLORS.textFainter, fontSize: 12, flexShrink: 0 }}>{expanded ? "▾" : "▸"}</span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: COLORS.textFaint,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
          }}
        >
          {doc.definition}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 20px 18px", borderTop: `1px solid ${COLORS.border}` }}>
          {doc.points.length > 0 && (
            <ul style={{ margin: "14px 0 4px", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: COLORS.text }}>
              {doc.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}

          {links.status === "loading" && (
            <div style={{ fontSize: 12, color: COLORS.textFainter, marginTop: 14 }}>관련 문서 불러오는 중...</div>
          )}
          {links.status === "error" && (
            <div style={{ fontSize: 12, color: COLORS.textFainter, marginTop: 14 }}>관련 문서를 불러오지 못했어요.</div>
          )}
          {links.status === "loaded" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, marginBottom: 8 }}>
                  관련 문서 ({links.outgoing.length})
                </div>
                <RelatedDocsPanel docs={links.outgoing} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, marginBottom: 8 }}>
                  이 문서를 참조하는 문서 ({links.backlinks.length})
                </div>
                <RelatedDocsPanel docs={links.backlinks} />
              </div>
            </div>
          )}

          <Link
            href={`/wiki/${doc.id}`}
            style={{
              display: "inline-block",
              marginTop: 14,
              fontSize: 12.5,
              fontWeight: 700,
              color: COLORS.red,
              textDecoration: "none",
            }}
          >
            자세히 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}
