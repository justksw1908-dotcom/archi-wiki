"use client";

// 위키 확장 미리보기 라운드: "개념을 클릭하면 바로 페이지 이동되기보다는, 칸이 늘어나면서 먼저
// 세부 내용을 보여주고, 그걸로도 모자랄 때 '자세히 보기' 버튼으로 이동하는 형식이 좋겠다"는 요청.
// 그래서 카드 자체는 더 이상 <Link>가 아니라 클릭하면 펼쳐지는 <button>이고, 실제 페이지 이동은
// 펼쳐진 안의 "자세히 보기" 링크로만 한다. 정의·포인트는 이미 목록 조회에서 같이 받아온 걸 그대로
// 보여주므로 펼칠 때 추가 네트워크 요청은 없다.
//
// 위키 미리보기 확장 라운드(2차): "자세히 보기(상세 페이지)에서 같이 나오는 관련 문서·역링크
// 알약도 이 펼침 안에 같이 나왔으면 좋겠다"는 요청으로 관련 문서·역링크 알약도 같이 보여준다.
// 처음엔 펼칠 때 GET /api/wiki/pages/[id]로 그때그때 불러왔는데, 실제로 써보니 펼칠 때마다
// 0.5~1초 정도 눈에 띄게 느려졌다 — 매번 클라이언트→서버→Supabase 왕복이 새로 생기는 거라서.
// 그래서 부모(wiki/page.tsx)가 화면에 뜬 결과 전체(최대 300개)에 대해 링크를 한 번에 일괄
// 조회해서 이미 계산된 outgoing/backlinks를 props로 내려주는 방식으로 바꿨다 — 정의·포인트와
// 똑같이 목록 조회 시점에 이미 다 갖고 있어서, 펼칠 때 추가 요청이 전혀 없다(즉시 반응).
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

export default function WikiResultCard({
  doc,
  outgoing = [],
  backlinks = [],
}: {
  doc: WikiResultDoc;
  outgoing?: RelatedDoc[];
  backlinks?: RelatedDoc[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
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

          {(outgoing.length > 0 || backlinks.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
              {outgoing.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, marginBottom: 8 }}>
                    관련 문서 ({outgoing.length})
                  </div>
                  <RelatedDocsPanel docs={outgoing} />
                </div>
              )}
              {backlinks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, marginBottom: 8 }}>
                    이 문서를 참조하는 문서 ({backlinks.length})
                  </div>
                  <RelatedDocsPanel docs={backlinks} />
                </div>
              )}
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
