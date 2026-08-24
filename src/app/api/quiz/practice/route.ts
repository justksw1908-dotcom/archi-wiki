// Phase 6: 풀 퀴즈 묶음을 무작위로 가져온다. 정답(answer)은 절대 내려주지 않는다 —
// 채점은 사용자가 제출한 뒤 /api/quiz/attempts에서 서버가 코드로 판정한다.
//
// Phase 10 후속(로드맵 이후 추가 요청): 퀴즈 풀이는 로그인 없이도 가능해서 이 라우트는
// 로그인 여부를 확인하지 않는다 — get_random_quiz_items() DB 함수 자체가 이제 누구나
// (anon 포함) 호출 가능하게 바뀌었다(supabase/migrations/006_phase10b_public_quiz_practice.sql).
// 막아야 하는 건 "생성"이지 "풀이"가 아니다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

export async function GET(request: Request) {
  const supabase = await createClient();

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
