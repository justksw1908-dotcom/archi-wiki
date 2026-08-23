// Phase 6 (수정): 퀴즈를 어떤 범위(장/절/개별 문서)로 생성할지 고르는 화면에 쓸 데이터.
// 문서마다 이미 퀴즈가 있는지(has_quiz)까지 같이 내려줘서, 화면에서 이미 만든 건 건너뛸 수 있게 한다.
//
// 주의: Supabase REST API(PostgREST)는 한 번의 select에 기본 최대 1000행까지만 돌려준다
// (대시보드 Settings > API > Max Rows, 기본값 1000). 문서가 1104개라 이 한도를 넘기 때문에,
// .range()로 1000개씩 나눠 끝까지 반복 조회해야 전체가 다 온다 — 실제로 이 한도에 걸려서
// section 정렬상 뒤쪽(6장)이 잘려 안 보이는 문제를 겪은 뒤 이렇게 고쳤다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-paginate";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: pages, error: pagesError } = await fetchAllRows<{ id: string; title: string; section: string }>(
    supabase,
    "wiki_pages",
    "id, title, section",
    { orderColumn: "section" }
  );

  if (pagesError) {
    return NextResponse.json({ ok: false, step: "db_fetch_pages", message: pagesError.message }, { status: 500 });
  }

  const { data: quizPageRows, error: quizError } = await fetchAllRows<{ wiki_page_id: string }>(
    supabase,
    "quiz_items",
    "wiki_page_id"
  );
  if (quizError) {
    return NextResponse.json({ ok: false, step: "db_fetch_quiz", message: quizError.message }, { status: 500 });
  }
  const donePageIds = new Set((quizPageRows ?? []).map((r) => r.wiki_page_id));

  const items = (pages ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    section: p.section,
    has_quiz: donePageIds.has(p.id),
  }));

  return NextResponse.json({ ok: true, items });
}
