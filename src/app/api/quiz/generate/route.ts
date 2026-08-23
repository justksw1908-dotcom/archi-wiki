// Phase 6/8 (수정): 사용자가 /quiz/select에서 직접 고른 문서 id들에 대해서만 AI로 퀴즈를 만든다.
// 예전엔 남은 문서를 무조건 전부 처리했는데, "할당량이 걱정되니 장·절·문서 단위로 세밀하게
// 고를 수 있게 해달라"는 요청으로 범위를 요청 본문의 page_ids로 직접 지정하는 방식으로 바꿨다.
// 한 번 호출에 몇 문서씩만 처리(서버리스 실행 시간 제한) — 클라이언트가 자기 목록을 다 처리할 때까지
// 나눠서 반복 호출한다.
// Phase 8: generateQuizItemsAuto를 쓰면서, Gemini 할당량 초과 시 로컬 Ollama가 있으면 자동으로
// 대신 생성한다 — quota_exceeded는 이제 "Gemini 할당량 초과 + 로컬 Ollama도 못 씀"일 때만 켜진다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateQuizItemsAuto, QuizGenerationError, QuizQuotaExceededError, type GeminiQuizItem } from "@/lib/quiz-gemini";

const MAX_PAGES_PER_CALL = 3;

type RequestBody = { page_ids?: string[] };

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const requestedIds = Array.isArray(body.page_ids) ? body.page_ids.filter((id) => typeof id === "string") : [];
  if (requestedIds.length === 0) {
    return NextResponse.json({ ok: false, step: "input", message: "page_ids가 비어있습니다." }, { status: 400 });
  }
  // 한 번에 너무 많이 보내도 서버에서 방어적으로 앞부분만 처리한다 (실행 시간 제한 때문).
  const targetIds = requestedIds.slice(0, MAX_PAGES_PER_CALL);

  const { data: pages, error: pagesError } = await supabase
    .from("wiki_pages")
    .select("id, section, title, definition, points")
    .in("id", targetIds);

  if (pagesError) {
    return NextResponse.json({ ok: false, step: "db_fetch_pages", message: pagesError.message }, { status: 500 });
  }

  // 이미 퀴즈가 생긴 문서는 건너뛴다 (같은 배치를 실수로 두 번 보내도 중복 생성 안 되게).
  const { data: existing, error: existingError } = await supabase
    .from("quiz_items")
    .select("wiki_page_id")
    .in("wiki_page_id", targetIds);
  if (existingError) {
    return NextResponse.json({ ok: false, step: "db_fetch_existing", message: existingError.message }, { status: 500 });
  }
  const alreadyDone = new Set((existing ?? []).map((r) => r.wiki_page_id));
  const pagesToProcess = (pages ?? []).filter((p) => !alreadyDone.has(p.id));

  const errors: string[] = [];
  let createdCount = 0;
  let createdViaOllama = 0;
  let quotaExceeded = false;
  const skippedByQuota: string[] = [];

  for (const page of pagesToProcess) {
    // 이번 배치 안에서 이미 (할당량 초과 + 로컬 Ollama도 불가)를 확인했으면, 나머지 문서는
    // API를 다시 부르지 않고(해봤자 또 똑같은 상황이라) 바로 건너뛴다.
    if (quotaExceeded) {
      skippedByQuota.push(page.title);
      continue;
    }

    let items: GeminiQuizItem[];
    let source: "gemini" | "ollama";
    try {
      const result = await generateQuizItemsAuto(
        page.title,
        page.section,
        page.definition,
        Array.isArray(page.points) ? page.points : []
      );
      items = result.items;
      source = result.source;
    } catch (e) {
      if (e instanceof QuizQuotaExceededError) {
        quotaExceeded = true;
        skippedByQuota.push(page.title);
        continue;
      }
      const message = e instanceof QuizGenerationError ? e.message : e instanceof Error ? e.message : String(e);
      errors.push(`"${page.title}": ${message}`);
      continue;
    }

    const rows = items.map((item) => {
      if (item.type === "multiple_choice") {
        return {
          user_id: user.id,
          wiki_page_id: page.id,
          type: "multiple_choice" as const,
          question: { stem: item.stem, choices: item.choices },
          answer: { correct_choice: item.correct_choice },
          answer_variants: [],
        };
      }
      if (item.type === "true_false") {
        return {
          user_id: user.id,
          wiki_page_id: page.id,
          type: "true_false" as const,
          question: { stem: item.stem },
          answer: { value: item.correct_bool },
          answer_variants: [],
        };
      }
      // fill_blank / short_answer
      return {
        user_id: user.id,
        wiki_page_id: page.id,
        type: item.type,
        question: { stem: item.stem },
        answer: { text: item.correct_text },
        answer_variants: item.answer_variants ?? [],
      };
    });

    const { error: insertError, count } = await supabase.from("quiz_items").insert(rows, { count: "exact" });
    if (insertError) {
      errors.push(`"${page.title}" 퀴즈 저장 실패: ${insertError.message}`);
      continue;
    }
    const insertedCount = count ?? rows.length;
    createdCount += insertedCount;
    if (source === "ollama") createdViaOllama += insertedCount;
  }

  return NextResponse.json({
    ok: true,
    processed_ids: targetIds,
    created: createdCount,
    created_via_ollama: createdViaOllama,
    errors,
    quota_exceeded: quotaExceeded,
    skipped_by_quota: skippedByQuota,
  });
}
