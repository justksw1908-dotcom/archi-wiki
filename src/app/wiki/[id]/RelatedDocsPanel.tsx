"use client";

// 위키 확장 미리보기 라운드: "관련 문서" 칩을 눌러도 바로 그 문서로 이동하지 않고, 칩 아래에
// 미리보기 패널이 펼쳐지도록 바꿨다. 칩은 여러 개가 한 줄에 나열되는 좁은 형태라 각 칩 안에
// 내용을 다 펼치기는 비좁아서, 한 번에 하나만 선택해서 그 아래 공용 패널에 보여주는 방식(아코디언과
// 비슷하지만 "동시에 하나만 열림")을 썼다.
import Link from "next/link";
import { useState } from "react";
import { COLORS } from "@/lib/theme";

export type RelatedDoc = {
  id: string;
  title: string;
  section: string;
  definition: string;
  points: string[];
  flagged: boolean;
};

export default function RelatedDocsPanel({ docs }: { docs: RelatedDoc[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = docs.find((d) => d.id === selectedId) ?? null;

  if (docs.length === 0) {
    return <span style={{ fontSize: 13, color: COLORS.textFainter }}>없음</span>;
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {docs.map((d) => {
          const active = d.id === selectedId;
          return (
            <button
              key={d.id}
              onClick={() => setSelectedId(active ? null : d.id)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? COLORS.red : COLORS.border}`,
                background: active ? COLORS.redBg : "#fff",
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                color: active ? COLORS.red : COLORS.textMuted,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {d.flagged && <span style={{ color: COLORS.orange }}>⚠ </span>}
              {d.title}
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          style={{
            marginTop: 12,
            padding: "16px 18px",
            borderRadius: 14,
            border: `1px solid ${COLORS.redBorder}`,
            background: COLORS.redBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.text }}>{selected.title}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.textFaint, background: "#fff", padding: "2px 8px", borderRadius: 999 }}>
              {selected.section}
            </span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: COLORS.text, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
            {selected.definition}
          </p>
          {selected.points.length > 0 && (
            <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: COLORS.text }}>
              {selected.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <Link href={`/wiki/${selected.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.red, textDecoration: "none" }}>
            자세히 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}
