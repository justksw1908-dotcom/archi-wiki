"use client";

// 위키 확장 미리보기 라운드: "개념을 클릭하면 바로 페이지 이동되기보다는, 칸이 늘어나면서 먼저
// 세부 내용을 보여주고, 그걸로도 모자랄 때 '자세히 보기' 버튼으로 이동하는 형식이 좋겠다"는 요청.
// 그래서 카드 자체는 더 이상 <Link>가 아니라 클릭하면 펼쳐지는 <button>이고, 실제 페이지 이동은
// 펼쳐진 안의 "자세히 보기" 링크로만 한다. 정의·포인트는 이미 목록 조회에서 같이 받아온 걸 그대로
// 보여주므로 펼칠 때 추가 네트워크 요청은 없다.
import Link from "next/link";
import { useState } from "react";
import { COLORS } from "@/lib/theme";

export type WikiResultDoc = {
  id: string;
  title: string;
  section: string;
  definition: string;
  points: string[];
  flagged: boolean;
};

export default function WikiResultCard({ doc }: { doc: WikiResultDoc }) {
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
          <Link
            href={`/wiki/${doc.id}`}
            style={{
              display: "inline-block",
              marginTop: 12,
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
