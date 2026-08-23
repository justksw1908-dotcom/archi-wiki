"use client";

// Phase 4: AI가 "기존 문서와 겹치지만 추가/수정할 내용이 있다"고 판단한 제안들을
// 사람이 직접 승인/거절하는 화면. 여기서 승인해야만 실제 wiki_pages가 바뀐다.
import { useCallback, useEffect, useState } from "react";

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
    <div style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>승인 대기열</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        AI가 기존 위키 문서와 겹치는 내용을 발견했을 때만 여기에 나타나요. 승인해야 실제 문서가 바뀌어요.
        (완전히 새로운 개념은 대기 없이 바로 문서로 만들어져요.)
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#F8E5E1", border: "1px solid #E8B9AC", borderRadius: 8, fontSize: 13.5 }}>
          오류: {error}
        </div>
      )}

      {items === null && <p style={{ color: "#888", fontSize: 14 }}>불러오는 중...</p>}
      {items !== null && items.length === 0 && <p style={{ color: "#888", fontSize: 14 }}>대기 중인 항목이 없어요.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items?.map((item) => (
          <div key={item.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
              {item.change_type === "extend" ? "기존 문서에 내용 추가 제안" : "기존 문서 수정 제안"}
              {" · 대상: "}
              <strong>{item.wiki_pages?.title ?? "(알 수 없음)"}</strong>
            </div>

            {item.reason && <p style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>이유: {item.reason}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>현재 내용</div>
                <div style={{ fontSize: 13, background: "#fafafa", padding: 10, borderRadius: 6, whiteSpace: "pre-wrap" }}>
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
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>제안된 내용</div>
                <div style={{ fontSize: 13, background: "#F4F8F5", padding: 10, borderRadius: 6, whiteSpace: "pre-wrap" }}>
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
                style={{ padding: "6px 14px", fontSize: 13, borderRadius: 6, border: "1px solid #4C8A6A", background: "#E1EEE9", cursor: "pointer" }}
              >
                승인
              </button>
              <button
                onClick={() => resolve(item.id, "reject")}
                disabled={busyId === item.id}
                style={{ padding: "6px 14px", fontSize: 13, borderRadius: 6, border: "1px solid #B45B45", background: "#F8E5E1", cursor: "pointer" }}
              >
                거절
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
