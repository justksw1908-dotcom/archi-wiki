// Phase 4: 승인 대기열 항목 하나를 승인(approve) 또는 거절(reject)한다.
// 승인 시에만 실제로 wiki_pages를 바꾼다 — AI가 기존 위키를 마음대로 고치지 않는다는
// 설계(사용자가 직접 확정한 3단계 편집 권한 모델)를 여기서 그대로 구현한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ActionBody = { action?: "approve" | "reject" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { ok: false, step: "input", message: "action은 approve 또는 reject여야 합니다." },
      { status: 400 }
    );
  }

  const { data: change, error: fetchError } = await supabase
    .from("pending_changes")
    .select("id, status, change_type, target_page_id, proposed_definition, proposed_points, proposed_links")
    .eq("id", id)
    .single();

  if (fetchError || !change) {
    return NextResponse.json({ ok: false, step: "db_fetch", message: "대기 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  if (change.status !== "pending") {
    return NextResponse.json(
      { ok: false, step: "state", message: "이미 처리된 항목입니다." },
      { status: 409 }
    );
  }

  if (body.action === "reject") {
    const { error: rejectError } = await supabase
      .from("pending_changes")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (rejectError) {
      return NextResponse.json({ ok: false, step: "db_update", message: rejectError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // action === "approve"
  const { data: targetPage, error: targetError } = await supabase
    .from("wiki_pages")
    .select("id, definition, points")
    .eq("id", change.target_page_id)
    .single();

  if (targetError || !targetPage) {
    return NextResponse.json(
      { ok: false, step: "db_fetch_target", message: "대상 위키 문서를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const existingPoints: string[] = Array.isArray(targetPage.points) ? targetPage.points : [];
  const proposedPoints: string[] = Array.isArray(change.proposed_points) ? change.proposed_points : [];

  let newDefinition: string;
  let newPoints: string[];

  if (change.change_type === "extend") {
    // extend: 기존 내용은 남기고, 겹치지 않는 새 내용만 덧붙인다.
    newDefinition =
      targetPage.definition && change.proposed_definition && !targetPage.definition.includes(change.proposed_definition)
        ? `${targetPage.definition}\n\n${change.proposed_definition}`
        : targetPage.definition || change.proposed_definition;
    newPoints = [...existingPoints, ...proposedPoints.filter((p) => !existingPoints.includes(p))];
  } else {
    // edit: AI가 기존 내용이 틀렸다고 판단한 경우 — 제안 내용으로 교체.
    newDefinition = change.proposed_definition || targetPage.definition;
    newPoints = proposedPoints.length ? proposedPoints : existingPoints;
  }

  const { error: updateError } = await supabase
    .from("wiki_pages")
    .update({ definition: newDefinition, points: newPoints })
    .eq("id", targetPage.id);

  if (updateError) {
    return NextResponse.json({ ok: false, step: "db_update_page", message: updateError.message }, { status: 500 });
  }

  // 제안된 관련 문서 제목들을 실제 문서 id로 찾아 링크를 만든다 (못 찾으면 조용히 건너뜀).
  const proposedLinks: string[] = Array.isArray(change.proposed_links) ? change.proposed_links : [];
  if (proposedLinks.length) {
    const { data: linkTargets } = await supabase.from("wiki_pages").select("id, title").in("title", proposedLinks);
    const linkRows = (linkTargets ?? [])
      .filter((p) => p.id !== targetPage.id)
      .map((p) => ({ user_id: user.id, from_page_id: targetPage.id, to_page_id: p.id }));
    if (linkRows.length) {
      await supabase.from("wiki_links").upsert(linkRows, { onConflict: "from_page_id,to_page_id", ignoreDuplicates: true });
    }
  }

  const { error: resolveError } = await supabase
    .from("pending_changes")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", id);

  if (resolveError) {
    return NextResponse.json({ ok: false, step: "db_update_pending", message: resolveError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "approved" });
}
