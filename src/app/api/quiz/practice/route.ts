// Phase 6: 풀 퀴즈 묶음을 무작위로 가져온다. 정답(answer)은 절대 내려주지 않는다 —
// 채점은 사용자가 제출한 뒤 /api/quiz/attempts에서 서버가 코드로 판정한다.
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

  const { data, error } = await supabase.rpc("get_random_quiz_items", {
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
  };

  const items = ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    type: row.type,
    stem: row.question?.stem ?? "",
    choices: row.question?.choices,
    page_title: row.page_title,
    page_section: row.page_section,
  }));

  return NextResponse.json({ ok: true, items });
}
