"use client";

// Phase 4: AI가 "기존 문서와 겹치지만 추가/수정할 내용이 있다"고 판단한 제안들을
// 사람이 직접 승인/거절하는 화면. 여기서 승인해야만 실제 wiki_pages가 바뀐다.
//
// AI 에이전트 확장 라운드: 이 화면도 middleware가 로그인 없인 아예 못 들어오게 막아두므로(/pending은
// 공개 경로 목록에 없음) 여기 렌더링됐다는 것 자체가 로그인 상태라는 뜻이다 — 클라이언트 컴포넌트라
// 서버에서처럼 auth.getUser()를 직접 부를 수 없어서, loggedIn을 true로 고정해 넘긴다.
import { useCallback, useEffect, useState } from "react";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import AgentChatWidget from "../AgentChatWidget";

type PendingItem = {
  id: string;
  change_type: "extend" | "edit";
  proposed_title: string;
  proposed_definition: string;
  proposed_points: string[];
  proposed_links: string[];
  reason: string | null;
  created_at: string;
  target_page_id: string;
  wiki_pages: { title: string; definition: string; points: string[] } | null;
};

export default function PendingPage() {
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pending");
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "불러오기 실패");
        return;
      }
      setError(null);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }, []);

  useEffect(() => {
    // 페이지를 열자마자 목록을 한 번 불러온다 — 마운트 시 1회성 데이터 조회이므로 의도적.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const resolve = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/pending/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.message ?? "처리 실패");
          return;
        }
        setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "60px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.3, marginBottom: 8, color: COLORS.text }}>
        승인 대기열
      </h1>
      <p style={{ color: COLORS.textFaint, fontSize: 13.5, marginBottom: 26, lineHeight: 1.6 }}>
        AI가 기존 위키 문서와 겹치는 내용을 발견했을 때만 여기에 나타나요. 승인해야 실제 문서가 바뀌어요.
        (완전히 새로운 개념은 대기 없이 바로 문서로 만들어져요.)
      </p>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: COLORS.dangerBg,
            border: `1px solid ${COLORS.dangerBorder}`,
            borderRadius: 10,
            fontSize: 13.5,
            color: COLORS.dangerText,
          }}
        >
          오류: {error}
        </div>
      )}

      {items === null && <p style={{ color: COLORS.textFaint, fontSize: 14 }}>불러오는 중...</p>}
      {items !== null && items.length === 0 && <p style={{ color: COLORS.textFaint, fontSize: 14 }}>대기 중인 항목이 없어요.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items?.map((item) => (
          <div key={item.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: COLORS.red,
                  background: COLORS.redBg,
                  border: `1px solid ${COLORS.redBorder}`,
                  padding: "2px 8px",
                  borderRadius: 999,
                  marginRight: 6,
                }}
              >
                {item.change_type === "extend" ? "내용 추가 제안" : "수정 제안"}
              </span>
              대상: <strong style={{ color: COLORS.text }}>{item.wiki_pages?.title ?? "(알 수 없음)"}</strong>
            </div>

            {item.reason && <p style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 10 }}>이유: {item.reason}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textFainter, marginBottom: 4 }}>현재 내용</div>
                <div
                  style={{
                    fontSize: 13,
                    background: COLORS.bgSubtle,
                    border: `1px solid ${COLORS.border}`,
                    padding: 10,
                    borderRadius: 10,
                    whiteSpace: "pre-wrap",
                    color: COLORS.text,
                  }}
                >
                  {item.wiki_pages?.definition ?? "-"}
                  {item.wiki_pages?.points?.length ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {item.wiki_pages.points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.red, marginBottom: 4 }}>제안된 내용</div>
                <div
                  style={{
                    fontSize: 13,
                    background: COLORS.redBg,
                    border: `1px solid ${COLORS.redBorder}`,
                    padding: 10,
                    borderRadius: 10,
                    whiteSpace: "pre-wrap",
                    color: COLORS.text,
                  }}
                >
                  {item.proposed_definition}
                  {item.proposed_points?.length ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {item.proposed_points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => resolve(item.id, "approve")}
                disabled={busyId === item.id}
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
                승인
              </button>
              <button
                onClick={() => resolve(item.id, "reject")}
                disabled={busyId === item.id}
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
                거절
              </button>
            </div>
          </div>
        ))}
      </div>

      <AgentChatWidget loggedIn={true} />
    </div>
  );
}
