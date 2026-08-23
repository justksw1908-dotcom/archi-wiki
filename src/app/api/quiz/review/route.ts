// Phase 7: 오늘 복습할 문제 묶음을 가져온다. /api/quiz/practice(무작위)와 달리 SM-2 일정상
// 오늘(또는 이미 지난 날짜)이 next_review_at인 문제만 돌려준다. 정답(answer)은 여기서도 절대
// 안 내려주고, 채점은 /api/quiz/attempts가 그대로 담당한다(연습이든 복습이든 같은 채점 경로).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chapter = searchParams.get("chapter");
  const countParam = Number(searchParams.get("count"));
  const count = Number.isFinite(countParam) && countParam > 0 ? Math.min(countParam, MAX_COUNT) : DEFAULT_COUNT;

  const { data, error } = await supabase.rpc("get_due_review_items", {
    p_count: count,
    p_chapter: chapter || null,
  });

  if (error) {
    return NextResponse.json({ ok: false, step: "db_fetch", message: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    type: string;
    question: { stem: string; choices?: string[] };
    page_title: string;
    page_section: string;
    repetitions: number;
  };

  const items = ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    type: row.type,
    stem: row.question?.stem ?? "",
    choices: row.question?.choices,
    page_title: row.page_title,
    page_section: row.page_section,
    repetitions: row.repetitions,
  }));

  return NextResponse.json({ ok: true, items });
}
