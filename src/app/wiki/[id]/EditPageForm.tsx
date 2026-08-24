"use client";

// Phase 5: AI가 잘못 정리한 내용을 고칠 수 있는 최소한의 수동 편집 폼.
// 편집 버튼을 눌러야 폼이 열린다 — 평소엔 읽기 전용.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { COLORS } from "@/lib/theme";

type Initial = {
  section: string;
  title: string;
  definition: string;
  points: string[];
  flagged: boolean;
  links: string[];
};

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13.5,
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  boxSizing: "border-box",
  marginBottom: 10,
  fontFamily: "inherit",
  color: COLORS.text,
};

const labelStyle: CSSProperties = { display: "block", fontSize: 12, color: COLORS.textFaint, marginBottom: 4 };

export default function EditPageForm({ pageId, initial }: { pageId: string; initial: Initial }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFoundLinks, setNotFoundLinks] = useState<string[]>([]);

  const [section, setSection] = useState(initial.section);
  const [title, setTitle] = useState(initial.title);
  const [definition, setDefinition] = useState(initial.definition);
  const [pointsText, setPointsText] = useState(initial.points.join("\n"));
  const [linksText, setLinksText] = useState(initial.links.join("\n"));
  const [flagged, setFlagged] = useState(initial.flagged);

  const resetToInitial = () => {
    setSection(initial.section);
    setTitle(initial.title);
    setDefinition(initial.definition);
    setPointsText(initial.points.join("\n"));
    setLinksText(initial.links.join("\n"));
    setFlagged(initial.flagged);
    setError(null);
    setNotFoundLinks([]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotFoundLinks([]);
    try {
      const res = await fetch(`/api/wiki/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          title,
          definition,
          points: pointsText.split("\n").map((s) => s.trim()).filter(Boolean),
          links: linksText.split("\n").map((s) => s.trim()).filter(Boolean),
          flagged,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "저장 실패");
        return;
      }
      router.refresh();
      if (data.not_found_links?.length) {
        // 못 찾은 제목이 있으면 폼을 열어둔 채로 알려준다 — 나머지는 이미 저장된 상태.
        setNotFoundLinks(data.not_found_links);
      } else {
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 8,
          border: "none",
          background: COLORS.red,
          color: "#fff",
          cursor: "pointer",
        }}
      >
        편집하기
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textFaint, marginBottom: 12 }}>문서 편집</div>

      <label style={labelStyle}>분류 (section)</label>
      <input value={section} onChange={(e) => setSection(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>제목</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>정의</label>
      <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={4} style={fieldStyle} />

      <label style={labelStyle}>포인트 (한 줄에 하나씩)</label>
      <textarea value={pointsText} onChange={(e) => setPointsText(e.target.value)} rows={4} style={fieldStyle} />

      <label style={labelStyle}>관련 문서 (한 줄에 제목 하나씩 — 정확한 기존 문서 제목이어야 연결돼요)</label>
      <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={3} style={fieldStyle} />

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.text, marginBottom: 14 }}>
        <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
        최신 기준 재확인 필요로 표시 (⚠)
      </label>

      {error && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: COLORS.dangerBg,
            border: `1px solid ${COLORS.dangerBorder}`,
            borderRadius: 8,
            fontSize: 13,
            color: COLORS.dangerText,
          }}
        >
          오류: {error}
        </div>
      )}

      {notFoundLinks.length > 0 && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: COLORS.warningBg,
            border: `1px solid ${COLORS.warningBorder}`,
            borderRadius: 8,
            fontSize: 13,
            color: COLORS.warningText,
          }}
        >
          나머지는 저장됐어요. 다만 이 제목들은 기존 문서에서 못 찾아서 연결 안 됐어요: {notFoundLinks.join(", ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "7px 16px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: COLORS.red,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={() => {
            resetToInitial();
            setEditing(false);
          }}
          disabled={saving}
          style={{
            padding: "7px 16px",
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${COLORS.borderStrong}`,
            background: "#fff",
            color: COLORS.textMuted,
            cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}
