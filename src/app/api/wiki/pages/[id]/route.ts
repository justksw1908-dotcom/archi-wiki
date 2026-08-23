// Phase 5: 위키 문서 수동 편집 저장. AI 자동 생성/승인 대기열과는 별개로,
// 사람이 직접 문서를 고치는 경로라서 승인 절차 없이 바로 반영된다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type EditBody = {
  section?: string;
  title?: string;
  definition?: string;
  points?: string[];
  links?: string[];
  flagged?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: EditBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const section = body.section?.trim();
  const title = body.title?.trim();
  const definition = body.definition?.trim();
  const points = Array.isArray(body.points) ? body.points.filter((p) => typeof p === "string" && p.trim()) : [];
  const links = Array.isArray(body.links) ? body.links.filter((l) => typeof l === "string" && l.trim()) : [];
  const flagged = Boolean(body.flagged);

  if (!section || !title || !definition) {
    return NextResponse.json(
      { ok: false, step: "input", message: "분류·제목·정의는 비워둘 수 없습니다." },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchError } = await supabase.from("wiki_pages").select("id").eq("id", id).single();
  if (fetchError || !existing) {
    return NextResponse.json({ ok: false, step: "db_fetch", message: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("wiki_pages")
    .update({ section, title, definition, points, flagged })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ ok: false, step: "db_update", message: updateError.message }, { status: 500 });
  }

  // 관련 문서(나가는 링크)는 폼에서 준 목록으로 완전히 교체한다 — 기존 링크를 지우고 새로 만든다.
  const { error: deleteLinksError } = await supabase.from("wiki_links").delete().eq("from_page_id", id);
  if (deleteLinksError) {
    return NextResponse.json({ ok: false, step: "db_delete_links", message: deleteLinksError.message }, { status: 500 });
  }

  const notFoundTitles: string[] = [];
  if (links.length) {
    const { data: targets } = await supabase.from("wiki_pages").select("id, title").in("title", links);
    const foundTitles = new Set((targets ?? []).map((t) => t.title));
    for (const l of links) {
      if (!foundTitles.has(l)) notFoundTitles.push(l);
    }
    const linkRows = (targets ?? [])
      .filter((t) => t.id !== id)
      .map((t) => ({ user_id: user.id, from_page_id: id, to_page_id: t.id }));
    if (linkRows.length) {
      const { error: insertLinksError } = await supabase
        .from("wiki_links")
        .upsert(linkRows, { onConflict: "from_page_id,to_page_id", ignoreDuplicates: true });
      if (insertLinksError) {
        return NextResponse.json({ ok: false, step: "db_insert_links", message: insertLinksError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, not_found_links: notFoundTitles });
}
