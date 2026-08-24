"use client";

// Phase 10 후속(퀴즈 절 선택 라운드): "퀴즈 풀기"·"복습하기" 둘 다 장(章)만 고를 수 있었는데,
// 절(節) 단위로도 좁혀서 풀 수 있게 아코디언 피커를 추가했다. /quiz/select의 장/절 트리와
// 같은 시각 언어(카드+화살표)를 쓰되, 여기는 체크박스가 아니라 그냥 링크다 — 생성이 아니라
// 풀이/복습을 시작하는 곳이라서.
import Link from "next/link";
import { useState } from "react";
import { COLORS } from "@/lib/theme";

type SectionNode = { sectionNum: string; count: number };
export type ChapterNode = { chapter: string; label: string; sections: SectionNode[] };

export default function QuizLinks({
  tree,
  basePath,
  title,
  allLabel,
  hint,
}: {
  tree: ChapterNode[];
  basePath: string;
  title: string;
  allLabel: string;
  hint?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(chapter: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });
  }

  return (
    <div>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>{title}</h2>

      <Link
        href={basePath}
        style={{
          display: "inline-block",
          padding: "8px 16px",
          fontSize: 13.5,
          fontWeight: 700,
          borderRadius: 999,
          background: COLORS.red,
          color: "#fff",
          textDecoration: "none",
          marginBottom: 10,
        }}
      >
        {allLabel}
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tree.map((ch) => {
          const isOpen = expanded.has(ch.chapter);
          return (
            <div key={ch.chapter} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "9px 14px" }}>
              <button
                onClick={() => toggle(ch.chapter)}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13.5,
                  padding: 0,
                  textAlign: "left",
                  color: COLORS.text,
                }}
              >
                {isOpen ? "▾" : "▸"} {ch.chapter}장 · {ch.label}{" "}
                <span style={{ color: COLORS.textFainter, fontSize: 12 }}>({ch.sections.length}개 절)</span>
              </button>

              {isOpen && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, marginLeft: 4 }}>
                  <Link
                    href={`${basePath}?chapter=${ch.chapter}`}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      borderRadius: 999,
                      border: `1px solid ${COLORS.redBorder}`,
                      background: COLORS.redBg,
                      color: COLORS.red,
                      textDecoration: "none",
                    }}
                  >
                    {ch.chapter}장 전체
                  </Link>
                  {ch.sections.map((sec) => (
                    <Link
                      key={sec.sectionNum}
                      href={`${basePath}?chapter=${ch.chapter}&section=${sec.sectionNum}`}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12.5,
                        borderRadius: 999,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.textMuted,
                        textDecoration: "none",
                      }}
                    >
                      {sec.sectionNum}절 <span style={{ color: COLORS.textFainter }}>({sec.count})</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hint && <p style={{ fontSize: 12.5, color: COLORS.textFainter, marginTop: 10 }}>{hint}</p>}
    </div>
  );
}
