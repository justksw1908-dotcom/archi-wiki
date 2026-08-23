// Phase 4: 승인 대기열 목록 조회.
// AI가 "extend"(기존 문서에 추가할 내용 있음) 또는 "edit"(기존 문서 수정 필요)로 판단한
// 제안들은 여기 나열되고, 사용자가 승인해야만 실제 wiki_pages에 반영된다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("pending_changes")
    .select(
      "id, change_type, proposed_title, proposed_definition, proposed_points, proposed_links, reason, status, created_at, target_page_id, wiki_pages(title, definition, points)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, step: "db_fetch", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}
