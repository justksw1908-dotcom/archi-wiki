// Phase 2 완료 기준 확인용 라우트: "로컬에서 Supabase에 값 하나를 저장하고
// 다시 불러오는 데 성공"을 실제로 검증한다. 로그인 후 /api/dev-check로 접속.
// 확인 끝나면 지워도 되는 개발용 라우트.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, step: "auth", message: "로그인이 안 되어 있습니다. /login에서 먼저 로그인하세요." },
      { status: 401 }
    );
  }

  // 1. 저장
  const { data: inserted, error: insertError } = await supabase
    .from("wiki_pages")
    .insert({
      user_id: user.id,
      section: "__dev_check__",
      title: "연결 테스트 문서",
      definition: `Supabase 연결 확인용 — ${new Date().toISOString()}`,
      points: [],
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, step: "insert", message: insertError.message }, { status: 500 });
  }

  // 2. 다시 불러오기
  const { data: fetched, error: fetchError } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("id", inserted.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ ok: false, step: "select", message: fetchError.message }, { status: 500 });
  }

  // 3. 테스트 데이터 정리
  await supabase.from("wiki_pages").delete().eq("id", inserted.id);

  return NextResponse.json({
    ok: true,
    message: "저장 → 조회 → 삭제까지 성공했습니다. Supabase 연결이 정상입니다.",
    user_id: user.id,
    round_trip: fetched,
  });
}
