"use client";

// Phase 6: 실제로 퀴즈를 푸는 화면. 채점은 서버(/api/quiz/attempts)가 코드로 하고,
// 여기는 문제를 보여주고 답을 모아 제출하는 역할만 한다.
import Link from "next/link";
import { useEffect, useState } from "react";

type QuizItem = {
  id: string;
  type: "multiple_choice" | "fill_blank" | "true_false" | "short_answer";
  stem: string;
  choices?: string[];
  page_title: string;
  page_section: string;
};

type Result = { isCorrect: boolean; correctAnswer: Record<string, unknown>; nextReviewInDays: number };

export default function PracticeClient({ chapter }: { chapter: string | null }) {
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
  }, [chapter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      const qs = new URLSearchParams({ count: "10" });
      if (chapter) qs.set("chapter", chapter);
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
      setResult({ isCorrect: data.is_correct, correctAnswer: data.correct_answer, nextReviewInDays: data.next_review_in_days ?? 0 });
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
    <div style={{ maxWidth: 560, margin: "48px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <Link href="/quiz" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>
        ← 퀴즈 허브
      </Link>

      <h1 style={{ fontSize: 20, margin: "12px 0 20px" }}>{chapter ? `${chapter}장 퀴즈` : "전체 퀴즈"}</h1>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#F8E5E1", border: "1px solid #E8B9AC", borderRadius: 8, fontSize: 13.5 }}>
          오류: {error}
        </div>
      )}

      {items === null && !error && <p style={{ color: "#888", fontSize: 14 }}>불러오는 중...</p>}

      {items !== null && items.length === 0 && (
        <p style={{ color: "#888", fontSize: 14 }}>이 범위에는 아직 퀴즈가 없어요. 퀴즈 허브에서 먼저 생성해주세요.</p>
      )}

      {current && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
            {index + 1} / {items?.length} · {current.page_section} · {current.page_title}
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, marginBottom: 16 }}>{current.stem}</p>

          {current.type === "multiple_choice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {(current.choices ?? []).map((c) => (
                <label
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1px solid ${selected === c ? "#4C6A99" : "#ddd"}`,
                    background: selected === c ? "#E7EEF8" : "#fff",
                    cursor: result ? "default" : "pointer",
                  }}
                >
                  <input type="radio" name="choice" checked={selected === c} disabled={Boolean(result)} onChange={() => setSelected(c)} />
                  <span style={{ fontSize: 14 }}>{c}</span>
                </label>
              ))}
            </div>
          )}

          {current.type === "true_false" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
                    padding: "10px 0",
                    fontSize: 14,
                    borderRadius: 6,
                    border: `1px solid ${boolValue === opt.value ? "#4C6A99" : "#ccc"}`,
                    background: boolValue === opt.value ? "#E7EEF8" : "#fff",
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
              style={{ width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 16 }}
            />
          )}

          {result && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: 13.5,
                background: result.isCorrect ? "#E1EEE9" : "#F8E5E1",
                border: `1px solid ${result.isCorrect ? "#BEDACF" : "#E8B9AC"}`,
              }}
            >
              {result.isCorrect ? "정답이에요." : "틀렸어요."}{" "}
              {current.type === "multiple_choice" && `정답: ${result.correctAnswer.correct_choice}`}
              {current.type === "true_false" && `정답: ${result.correctAnswer.value ? "참" : "거짓"}`}
              {(current.type === "fill_blank" || current.type === "short_answer") && `정답: ${result.correctAnswer.text}`}
              <br />
              <span style={{ color: "#888" }}>
                다음 복습은 {result.nextReviewInDays}일 후예요{result.isCorrect ? "" : " (틀려서 내일 다시 나와요)"}.
              </span>
            </div>
          )}

          {!result ? (
            <button
              onClick={submit}
              disabled={submitting}
              style={{ padding: "8px 16px", fontSize: 13.5, borderRadius: 6, border: "1px solid #4C8A6A", background: "#E1EEE9", cursor: "pointer" }}
            >
              제출
            </button>
          ) : (
            <button
              onClick={next}
              style={{ padding: "8px 16px", fontSize: 13.5, borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer" }}
            >
              다음
            </button>
          )}
        </div>
      )}

      {items !== null && items.length > 0 && index >= items.length && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            {score.total}문제 중 {score.correct}개 맞혔어요.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={load}
              style={{ padding: "8px 16px", fontSize: 13.5, borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer" }}
            >
              다시 풀기
            </button>
            <Link
              href="/quiz"
              style={{ padding: "8px 16px", fontSize: 13.5, borderRadius: 6, border: "1px solid #999", textDecoration: "none", color: "#333" }}
            >
              퀴즈 허브로
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
