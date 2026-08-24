"use client";

// Phase 6: 실제로 퀴즈를 푸는 화면. 채점은 서버(/api/quiz/attempts)가 코드로 하고,
// 여기는 문제를 보여주고 답을 모아 제출하는 역할만 한다.
//
// 디자인 라운드: 시안(Quiz.dc.html)의 진행률 바 + 카드형 문제 + 정답/오답 배너를 옮겼다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { COLORS, FONT_FAMILY } from "@/lib/theme";

type QuizItem = {
  id: string;
  type: "multiple_choice" | "fill_blank" | "true_false" | "short_answer";
  stem: string;
  choices?: string[];
  page_title: string;
  page_section: string;
};

type Result = { isCorrect: boolean; correctAnswer: Record<string, unknown>; nextReviewInDays: number | null };

export default function PracticeClient({ chapter, section }: { chapter: string | null; section: string | null }) {
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [textValue, setTextValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    // 페이지에 들어오자마자 문제 묶음을 한 번 불러온다 — 마운트 시 1회성 조회라 의도적.
    load();
  }, [chapter, section]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      const qs = new URLSearchParams({ count: "10" });
      if (chapter) qs.set("chapter", chapter);
      if (chapter && section) qs.set("section", section);
      const res = await fetch(`/api/quiz/practice?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "불러오기 실패");
        return;
      }
      setError(null);
      setItems(data.items);
      setIndex(0);
      setScore({ correct: 0, total: 0 });
      resetAnswerState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  function resetAnswerState() {
    setSelected(null);
    setBoolValue(null);
    setTextValue("");
    setResult(null);
  }

  const current = items && index < items.length ? items[index] : null;

  const submit = async () => {
    if (!current) return;
    let userAnswer: Record<string, unknown>;
    if (current.type === "multiple_choice") {
      if (!selected) return;
      userAnswer = { selected };
    } else if (current.type === "true_false") {
      if (boolValue === null) return;
      userAnswer = { value: boolValue };
    } else {
      if (!textValue.trim()) return;
      userAnswer = { text: textValue.trim() };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quiz/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_item_id: current.id, user_answer: userAnswer }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "채점 실패");
        return;
      }
      setResult({
        isCorrect: data.is_correct,
        correctAnswer: data.correct_answer,
        nextReviewInDays: data.next_review_in_days ?? null,
      });
      setScore((s) => ({ correct: s.correct + (data.is_correct ? 1 : 0), total: s.total + 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    resetAnswerState();
    setIndex((i) => i + 1);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "44px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <Link href="/quiz" style={{ fontSize: 13, color: COLORS.textFainter, textDecoration: "none" }}>
        ← 퀴즈 허브
      </Link>

      <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.3, margin: "14px 0 20px", color: COLORS.text }}>
        {chapter ? `${chapter}장${section ? ` ${section}절` : ""} 퀴즈` : "전체 퀴즈"}
      </h1>

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

      {items === null && !error && <p style={{ color: COLORS.textFaint, fontSize: 14 }}>불러오는 중...</p>}

      {items !== null && items.length === 0 && (
        <p style={{ color: COLORS.textFaint, fontSize: 14 }}>이 범위에는 아직 퀴즈가 없어요. 퀴즈 허브에서 먼저 생성해주세요.</p>
      )}

      {current && items && (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 20,
            padding: 30,
            boxShadow: "0 2px 16px rgba(38,34,32,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: COLORS.red,
                background: COLORS.redBg,
                border: `1px solid ${COLORS.redBorder}`,
                padding: "3px 9px",
                borderRadius: 999,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {current.page_section}
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: COLORS.chipBg, overflow: "hidden" }}>
              <div
                style={{
                  width: `${((index + (result ? 1 : 0)) / items.length) * 100}%`,
                  height: "100%",
                  background: COLORS.orange,
                  transition: "width 0.2s",
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: COLORS.textFainter, flexShrink: 0 }}>
              {index + 1} / {items.length}
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: COLORS.textFainter, marginBottom: 8 }}>{current.page_title}</div>
          <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.7, marginBottom: 20, color: COLORS.text }}>{current.stem}</p>

          {current.type === "multiple_choice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {(current.choices ?? []).map((c) => (
                <label
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1.5px solid ${selected === c ? COLORS.red : COLORS.border}`,
                    background: selected === c ? COLORS.redBg : "#fff",
                    cursor: result ? "default" : "pointer",
                  }}
                >
                  <input type="radio" name="choice" checked={selected === c} disabled={Boolean(result)} onChange={() => setSelected(c)} />
                  <span style={{ fontSize: 14, color: COLORS.text }}>{c}</span>
                </label>
              ))}
            </div>
          )}

          {current.type === "true_false" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[
                { label: "참 (O)", value: true },
                { label: "거짓 (X)", value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  disabled={Boolean(result)}
                  onClick={() => setBoolValue(opt.value)}
                  style={{
                    flex: 1,
                    padding: "11px 0",
                    fontSize: 14,
                    borderRadius: 12,
                    border: `1.5px solid ${boolValue === opt.value ? COLORS.red : COLORS.border}`,
                    background: boolValue === opt.value ? COLORS.redBg : "#fff",
                    color: COLORS.text,
                    cursor: result ? "default" : "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {(current.type === "fill_blank" || current.type === "short_answer") && (
            <input
              value={textValue}
              disabled={Boolean(result)}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="답을 입력하세요"
              style={{
                width: "100%",
                padding: "11px 14px",
                fontSize: 14,
                borderRadius: 12,
                border: `1.5px solid ${COLORS.border}`,
                boxSizing: "border-box",
                marginBottom: 20,
                fontFamily: "inherit",
              }}
            />
          )}

          {result && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 18,
                padding: "14px 16px",
                borderRadius: 14,
                background: result.isCorrect ? COLORS.successBg : COLORS.dangerBg,
                border: `1px solid ${result.isCorrect ? COLORS.successBorder : COLORS.dangerBorder}`,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: result.isCorrect ? COLORS.success : COLORS.danger,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{result.isCorrect ? "✓" : "✕"}</span>
              </span>
              <div style={{ fontSize: 13.5 }}>
                <div style={{ fontWeight: 700, color: result.isCorrect ? COLORS.successText : COLORS.dangerText }}>
                  {result.isCorrect ? "정답이에요!" : "틀렸어요."}{" "}
                  {current.type === "multiple_choice" && `정답: ${result.correctAnswer.correct_choice}`}
                  {current.type === "true_false" && `정답: ${result.correctAnswer.value ? "참" : "거짓"}`}
                  {(current.type === "fill_blank" || current.type === "short_answer") && `정답: ${result.correctAnswer.text}`}
                </div>
                <div style={{ color: COLORS.textFaint, marginTop: 2 }}>
                  {result.nextReviewInDays !== null
                    ? `다음 복습은 ${result.nextReviewInDays}일 후예요${result.isCorrect ? "" : " (틀려서 내일 다시 나와요)"}.`
                    : "로그인하면 이 결과가 복습 일정에 저장돼요."}
                </div>
              </div>
            </div>
          )}

          {!result ? (
            <button
              onClick={submit}
              disabled={submitting}
              style={{
                width: "100%",
                padding: 13,
                fontSize: 14.5,
                fontWeight: 700,
                borderRadius: 12,
                border: "none",
                background: COLORS.red,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              제출
            </button>
          ) : (
            <button
              onClick={next}
              style={{
                width: "100%",
                padding: 13,
                fontSize: 14.5,
                fontWeight: 700,
                borderRadius: 12,
                border: "none",
                background: COLORS.red,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              다음 문제
            </button>
          )}
        </div>
      )}

      {items !== null && items.length > 0 && index >= items.length && (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28, textAlign: "center" }}>
          <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: COLORS.text }}>
            {score.total}문제 중 {score.correct}개 맞혔어요.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={load}
              style={{
                padding: "9px 18px",
                fontSize: 13.5,
                fontWeight: 700,
                borderRadius: 10,
                border: "none",
                background: COLORS.red,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              다시 풀기
            </button>
            <Link
              href="/quiz"
              style={{
                padding: "9px 18px",
                fontSize: 13.5,
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
                textDecoration: "none",
                color: COLORS.textMuted,
              }}
            >
              퀴즈 허브로
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
