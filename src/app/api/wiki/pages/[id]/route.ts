// Phase 5: 위키 문서 수동 편집 저장. AI 자동 생성/승인 대기열과는 별개로,
// 사람이 직접 문서를 고치는 경로라서 승인 절차 없이 바로 반영된다.
//
// 위키 미리보기 확장 라운드(2차): "/wiki 목록에서 카드를 펼쳤을 때도 관련 문서·역링크 알약이
// 같이 나왔으면 좋겠다"는 요청으로 GET을 추가했다. /wiki/[id] 상세 페이지가 서버 컴포넌트에서
// 하던 것과 같은 조회(나가는 링크·들어오는 링크 각각 조회 후 wiki_pages 배치 조회)를 여기서도
// 그대로 하되, 클라이언트(WikiResultCard)가 카드를 펼칠 때만 필요해서 그때 한 번만 호출한다 —
// 목록의 문서 300개 전부를 미리 조회하면 낭비라서 이렇게 지연 로딩으로 뺐다. 위키 열람 자체가
// 로그인 없이도 되는 공개 데이터라 이 GET도 로그인을 요구하지 않는다(wiki_pages/wiki_links의
// public select RLS 정책 그대로 적용됨 — supabase/migrations/005_phase10_public_wiki_read.sql).
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

type LinkedDoc = { id: string; title: string; section: string; definition: string; points: string[]; flagged: boolean };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: outgoingLinkRows } = await supabase.from("wiki_links").select("to_page_id").eq("from_page_id", id);
  const { data: backlinkRows } = await supabase.from("wiki_links").select("from_page_id").eq("to_page_id", id);

  const outgoingIds = (outgoingLinkRows ?? []).map((r) => r.to_page_id);
  const backlinkIds = (backlinkRows ?? []).map((r) => r.from_page_id);

  const [{ data: outgoingDocsRaw }, { data: backlinkDocsRaw }] = await Promise.all([
    outgoingIds.length
      ? supabase.from("wiki_pages").select("id, title, section, definition, points, flagged").in("id", outgoingIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
    backlinkIds.length
      ? supabase.from("wiki_pages").select("id, title, section, definition, points, flagged").in("id", backlinkIds)
      : Promise.resolve({ data: [] as LinkedDoc[] }),
  ]);

  const normalize = (rows: LinkedDoc[] | null) =>
    (rows ?? []).map((d) => ({ ...d, points: Array.isArray(d.points) ? d.points : [] }));

  return NextResponse.json({
    ok: true,
    outgoing: normalize(outgoingDocsRaw),
    backlinks: normalize(backlinkDocsRaw),
  });
}

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
