// Phase 6: 퀴즈 채점 로직. AI를 다시 부르지 않고 코드로만 정오답을 가린다 —
// 서술형·빈칸도 생성 시점에 같이 저장해둔 answer_variants(허용 표현 목록)와 비교한다.
export type QuizType = "multiple_choice" | "fill_blank" | "true_false" | "short_answer";

function normalizeText(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

// user_answer 형식은 문제 형식별로 다르다:
// multiple_choice → { selected: string }, true_false → { value: boolean }, fill_blank/short_answer → { text: string }
export function gradeAnswer(
  type: QuizType,
  answer: Record<string, unknown>,
  answerVariants: string[],
  userAnswer: Record<string, unknown>
): boolean {
  if (type === "multiple_choice") {
    const selected = typeof userAnswer.selected === "string" ? userAnswer.selected.trim() : "";
    const correct = typeof answer.correct_choice === "string" ? answer.correct_choice.trim() : "";
    return Boolean(selected) && selected === correct;
  }
  if (type === "true_false") {
    return typeof userAnswer.value === "boolean" && userAnswer.value === answer.value;
  }
  if (type === "fill_blank" || type === "short_answer") {
    const given = typeof userAnswer.text === "string" ? normalizeText(userAnswer.text) : "";
    if (!given) return false;
    const correctText = typeof answer.text === "string" ? answer.text : "";
    const candidates = [correctText, ...answerVariants].map(normalizeText).filter(Boolean);
    return candidates.includes(given);
  }
  return false;
}
