"use client";

// AI 에이전트 라운드: 위키 우측 하단에 떠 있는 채팅 위젯.
// 요청사항 그대로 — 버튼을 누르면 "기존 여백을 넘지 않는 범위"의 대화창이 나오는 형식이라서,
// 전체 화면을 덮지 않는 고정 크기 패널로 구현했다(모바일에서도 화면을 넘지 않도록 max 제한 포함).
// 문서 페이지에서는 context를 넘겨서(제목·정의·포인트·section) 그 문서 내용을 알고 답하게 하고,
// 목록 페이지 등에서는 context 없이 일반 대화만 한다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLORS, FONT_FAMILY } from "@/lib/theme";

export type AgentChatContext = {
  title: string;
  section: string;
  definition: string;
  points: string[];
} | null;

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AgentChatWidget({ loggedIn, context = null }: { loggedIn: boolean; context?: AgentChatContext }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setErrorMsg(null);
    const nextHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages,
          context,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setErrorMsg(data.message ?? "답변을 가져오지 못했어요.");
      }
    } catch {
      setErrorMsg("네트워크 오류로 답변을 가져오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, fontFamily: FONT_FAMILY }}>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 68,
            width: "min(340px, calc(100vw - 40px))",
            height: "min(460px, calc(100vh - 140px))",
            background: "#fff",
            borderRadius: 18,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 16px 40px rgba(38, 34, 32, 0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: COLORS.redBg,
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>AI 에이전트</div>
              <div style={{ fontSize: 11, color: COLORS.textFaint }}>
                {context ? `"${context.title}" 문서 인식 중` : "가볍게 물어보세요"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              style={{
                border: "none",
                background: "transparent",
                color: COLORS.textFaint,
                fontSize: 18,
                cursor: "pointer",
                lineHeight: 1,
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {!loggedIn ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 24,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 13, color: COLORS.textFaint, margin: 0 }}>로그인하면 AI 에이전트와 대화할 수 있어요.</p>
              <Link href="/login" style={{ fontSize: 13, fontWeight: 700, color: COLORS.red, textDecoration: "none" }}>
                로그인하러 가기 →
              </Link>
            </div>
          ) : (
            <>
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.length === 0 && (
                  <p style={{ fontSize: 12.5, color: COLORS.textFainter, margin: 0 }}>
                    {context ? "이 문서에 대해 궁금한 점을 물어보세요." : "궁금한 점을 편하게 물어보세요."}
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      padding: "9px 12px",
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      background: m.role === "user" ? COLORS.red : COLORS.chipBg,
                      color: m.role === "user" ? "#fff" : COLORS.text,
                    }}
                  >
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div
                    style={{
                      alignSelf: "flex-start",
                      padding: "9px 12px",
                      borderRadius: 12,
                      fontSize: 13,
                      background: COLORS.chipBg,
                      color: COLORS.textFaint,
                    }}
                  >
                    답변을 생각하고 있어요…
                  </div>
                )}
                {errorMsg && (
                  <div style={{ fontSize: 12, color: COLORS.dangerText, background: COLORS.dangerBg, borderRadius: 10, padding: "8px 10px" }}>
                    {errorMsg}
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: 10, display: "flex", gap: 8, flexShrink: 0 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="메시지를 입력하세요"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: 999,
                    border: `1.5px solid ${COLORS.border}`,
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: loading || !input.trim() ? COLORS.textFainter : COLORS.red,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: loading || !input.trim() ? "default" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  전송
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="AI 에이전트 열기"
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          border: "none",
          background: COLORS.red,
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 8px 22px rgba(227, 24, 55, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
