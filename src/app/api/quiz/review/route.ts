// Phase 7: 오늘 복습할 문제 묶음을 가져온다. /api/quiz/practice(무작위)와 달리 SM-2 일정상
// 오늘(또는 이미 지난 날짜)이 next_review_at인 문제만 돌려준다. 정답(answer)은 여기서도 절대
// 안 내려주고, 채점은 /api/quiz/attempts가 그대로 담당한다(연습이든 복습이든 같은 채점 경로).
//
// AI 에이전트 확장 라운드(퀴즈도 문서 인식형으로): get_due_review_items가 이제 문제가 속한
// 위키 문서의 definition·points도 같이 내려준다(008 마이그레이션) — /api/quiz/practice와 같은 이유.
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
  const section = chapter ? searchParams.get("section") : null;
  const countParam = Number(searchParams.get("count"));
  const count = Number.isFinite(countParam) && countParam > 0 ? Math.min(countParam, MAX_COUNT) : DEFAULT_COUNT;

  const { data, error } = await supabase.rpc("get_due_review_items", {
    p_count: count,
    p_chapter: chapter || null,
    p_section: section || null,
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
    page_definition: string;
    page_points: unknown;
    repetitions: number;
  };

  const items = ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    type: row.type,
    stem: row.question?.stem ?? "",
    choices: row.question?.choices,
    page_title: row.page_title,
    page_section: row.page_section,
    page_definition: row.page_definition ?? "",
    page_points: Array.isArray(row.page_points) ? (row.page_points as string[]) : [],
    repetitions: row.repetitions,
  }));

  return NextResponse.json({ ok: true, items });
}
