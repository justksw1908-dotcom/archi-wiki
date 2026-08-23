// Phase 6/7: 퀴즈 제출 → 채점(AI 재호출 없이 코드로만) → quiz_attempts에 기록 + SM-2 망각곡선 갱신.
// quiz_attempts는 시도마다 한 줄씩 쌓이는 로그라, "이 문제를 지금 얼마나 잘 기억하고 있는지"는
// 가장 최근 시도 행의 ease_factor/interval_days/repetitions로 표현된다. 이번 시도 전의 최신 상태를
// 가져와서(없으면 초기값) src/lib/sm2.ts의 순수 함수로 다음 상태를 계산하고, 그 값으로 새 행을 넣는다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gradeAnswer, type QuizType } from "@/lib/quiz-grading";
import { computeSm2, SM2_DEFAULT, addDays, toDateOnlyString } from "@/lib/sm2";

type AttemptBody = {
  quiz_item_id?: string;
  user_answer?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: AttemptBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!body.quiz_item_id || !body.user_answer) {
    return NextResponse.json(
      { ok: false, step: "input", message: "quiz_item_id와 user_answer가 필요합니다." },
      { status: 400 }
    );
  }

  const { data: item, error: itemError } = await supabase
    .from("quiz_items")
    .select("id, type, answer, answer_variants")
    .eq("id", body.quiz_item_id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ ok: false, step: "db_fetch", message: "문제를 찾을 수 없습니다." }, { status: 404 });
  }

  const isCorrect = gradeAnswer(
    item.type as QuizType,
    (item.answer ?? {}) as Record<string, unknown>,
    Array.isArray(item.answer_variants) ? item.answer_variants : [],
    body.user_answer
  );

  // 이 문제를 이전에 몇 번 풀었었는지 가장 최근 시도에서 SM-2 상태를 가져온다 (한 번도 안 풀었으면 초기값).
  const { data: lastAttempt, error: lastAttemptError } = await supabase
    .from("quiz_attempts")
    .select("ease_factor, interval_days, repetitions")
    .eq("user_id", user.id)
    .eq("quiz_item_id", item.id)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAttemptError) {
    return NextResponse.json({ ok: false, step: "db_fetch_prev_attempt", message: lastAttemptError.message }, { status: 500 });
  }

  const prevState = lastAttempt
    ? {
        easeFactor: Number(lastAttempt.ease_factor),
        intervalDays: lastAttempt.interval_days,
        repetitions: lastAttempt.repetitions,
      }
    : SM2_DEFAULT;

  const nextState = computeSm2(prevState, isCorrect);
  const nextReviewAt = toDateOnlyString(addDays(new Date(), nextState.intervalDays));

  const { error: insertError } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    quiz_item_id: item.id,
    is_correct: isCorrect,
    user_answer: body.user_answer,
    ease_factor: nextState.easeFactor,
    interval_days: nextState.intervalDays,
    repetitions: nextState.repetitions,
    next_review_at: nextReviewAt,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, step: "db_insert", message: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    is_correct: isCorrect,
    correct_answer: item.answer,
    next_review_in_days: nextState.intervalDays,
    next_review_at: nextReviewAt,
  });
}
