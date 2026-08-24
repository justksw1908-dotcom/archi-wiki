// Phase 6/7: 퀴즈 제출 → 채점(AI 재호출 없이 코드로만) → quiz_attempts에 기록 + SM-2 망각곡선 갱신.
// quiz_attempts는 시도마다 한 줄씩 쌓이는 로그라, "이 문제를 지금 얼마나 잘 기억하고 있는지"는
// 가장 최근 시도 행의 ease_factor/interval_days/repetitions로 표현된다. 이번 시도 전의 최신 상태를
// 가져와서(없으면 초기값) src/lib/sm2.ts의 순수 함수로 다음 상태를 계산하고, 그 값으로 새 행을 넣는다.
//
// Phase 10 후속(로드맵 이후 추가 요청): 로그인 없이도 채점까지는 된다 — 다만 quiz_attempts.user_id가
// NOT NULL(로그인한 계정 것)이라 비로그인 사용자의 시도는 애초에 저장할 대상이 없고, "다음 복습은
// 언제"라는 개념 자체도 로그인한 계정의 개인 기록이라 비로그인 사용자에게는 의미가 없다. 그래서
// 로그인 안 했으면 채점 결과만 그 자리에서 알려주고 DB에는 아무것도 안 남긴다(기록/SM-2 갱신 생략).
//
// 정답(answer)을 가져올 때 로그인 여부와 무관하게 항상 서비스 롤 클라이언트(RLS 우회)를 쓴다 —
// 비로그인 사용자가 채점받으려면 어차피 서버가 정답을 읽어야 하는데, quiz_items 테이블 자체에는
// anon select 권한을 안 줬으므로(누군가 개발자 도구로 quiz_items를 통째로 조회해서 정답을 미리
// 보는 걸 막기 위해) 이 라우트 안에서만, 딱 그 하나의 문제에 대해서만 서비스 롤로 조회한다.
import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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
  } = await supabase.auth.getUser();

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

  const serviceRole = createServiceRoleClient();
  const { data: item, error: itemError } = await serviceRole
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

  if (!user) {
    // 비로그인: 채점 결과만 알려주고 기록은 남기지 않는다.
    return NextResponse.json({
      ok: true,
      is_correct: isCorrect,
      correct_answer: item.answer,
      next_review_in_days: null,
      next_review_at: null,
    });
  }

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
