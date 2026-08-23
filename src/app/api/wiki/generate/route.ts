// Phase 4/8: 텍스트 청크를 Gemini로 처리해서 위키 문서를 만드는 라우트.
// 파일 하나를 한 번에 다 처리하지 않고 한 번 호출에 최대 CHUNKS_PER_CALL개만 처리한다 —
// Vercel 서버리스 함수는 플랜에 따라 실행 시간 제한이 있어서(Hobby 기본 10초), 청크가
// 많은 파일을 한 요청에 몰아넣으면 타임아웃날 수 있다. 클라이언트가 남은 청크가 없어질
// 때까지 이 라우트를 반복 호출하는 방식으로 나눠서 처리한다.
// Phase 8: generateWikiConceptsAuto를 쓰면서, Gemini 할당량 초과 시 로컬 Ollama가 있으면 자동으로
// 대신 생성한다. 할당량 초과 + Ollama도 못 쓰면 남은 청크는 API를 더 안 부르고 멈춘다 —
// 예전엔 이 경우를 구분 안 해서 클라이언트가 done:false인 채로 계속 재호출해 할당량 오류가
// 끝없이 반복되는 문제가 있었다(청크가 실패하면 processed_at이 안 찍혀서 remaining이 0이
// 안 됨 → 클라이언트가 무한 반복 호출).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWikiConceptsAuto, GeminiGenerationError, GeminiQuotaExceededError, type GeminiConcept } from "@/lib/gemini";
import { fetchAllRows } from "@/lib/supabase-paginate";

const CHUNKS_PER_CALL = 2;

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { source_file_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!body.source_file_id) {
    return NextResponse.json({ ok: false, step: "input", message: "source_file_id가 필요합니다." }, { status: 400 });
  }

  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("source_files")
    .select("id")
    .eq("id", body.source_file_id)
    .single();

  if (sourceFileError || !sourceFile) {
    return NextResponse.json({ ok: false, step: "input", message: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: chunks, error: chunksError } = await supabase
    .from("text_chunks")
    .select("id, chunk_index, content")
    .eq("source_file_id", sourceFile.id)
    .is("processed_at", null)
    .order("chunk_index", { ascending: true })
    .limit(CHUNKS_PER_CALL);

  if (chunksError) {
    return NextResponse.json({ ok: false, step: "db_fetch_chunks", message: chunksError.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ ok: true, done: true, processed: 0, remaining: 0, new_pages: 0, pending_changes: 0 });
  }

  // PostgREST 기본 1000행 한도(문서가 1104개라 초과)를 넘겨 전체 제목을 다 가져와야 중복 생성
  // 판단·extend/edit 대상 찾기가 정확하다 — .range() 없이 select만 하면 뒤쪽 문서 제목이
  // 누락돼서 이미 있는 개념을 "new"로 다시 만들거나 extend/edit 대상을 못 찾는 문제가 있었다.
  const { data: existingPages, error: titlesError } = await fetchAllRows<{ id: string; title: string }>(
    supabase,
    "wiki_pages",
    "id, title"
  );
  if (titlesError) {
    return NextResponse.json({ ok: false, step: "db_fetch_titles", message: titlesError.message }, { status: 500 });
  }

  const titleToId = new Map<string, string>((existingPages ?? []).map((p) => [p.title, p.id]));
  const errors: string[] = [];
  let newPageCount = 0;
  let pendingChangeCount = 0;
  let quotaExceeded = false;

  for (const chunk of chunks) {
    // 이번 호출 안에서 이미 (할당량 초과 + 로컬 Ollama도 불가)를 확인했으면, 나머지 청크는
    // API를 다시 부르지 않고 멈춘다(processed_at을 안 찍으니 나중에 이어서 재시도 가능).
    if (quotaExceeded) break;

    let concepts: GeminiConcept[];
    try {
      const result = await generateWikiConceptsAuto(chunk.content, [...titleToId.keys()]);
      concepts = result.concepts;
    } catch (e) {
      if (e instanceof GeminiQuotaExceededError) {
        quotaExceeded = true;
        errors.push(`청크 ${chunk.chunk_index}: 무료 할당량을 초과해서 멈췄어요.`);
        break;
      }
      const message = e instanceof GeminiGenerationError ? e.message : e instanceof Error ? e.message : String(e);
      errors.push(`청크 ${chunk.chunk_index}: ${message}`);
      continue; // 이 청크는 실패로 남기고(processed_at 안 찍음) 다음 청크로 — 나중에 재시도 가능
    }

    // 1차: new 개념부터 먼저 만든다 (같은 청크 안에서 서로 링크를 걸 수 있게).
    for (const concept of concepts.filter((c) => c.action === "new")) {
      if (titleToId.has(concept.title)) {
        // 이미 같은 제목이 있으면(다른 청크에서 방금 생겼거나 AI가 착각) new로 중복 생성하지 않는다.
        continue;
      }
      const { data: inserted, error: insertError } = await supabase
        .from("wiki_pages")
        .insert({
          user_id: user.id,
          source_chunk_id: chunk.id,
          section: concept.section,
          title: concept.title,
          definition: concept.definition,
          points: concept.points,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        errors.push(`"${concept.title}" 생성 실패: ${insertError?.message ?? "알 수 없는 오류"}`);
        continue;
      }
      titleToId.set(concept.title, inserted.id);
      newPageCount++;
    }

    // 2차: 링크 연결 (new로 방금 만든 문서들 대상)
    for (const concept of concepts.filter((c) => c.action === "new")) {
      const fromId = titleToId.get(concept.title);
      if (!fromId) continue;
      const linkRows = concept.links
        .map((linkTitle) => titleToId.get(linkTitle))
        .filter((id): id is string => Boolean(id) && id !== fromId)
        .map((toId) => ({ user_id: user.id, from_page_id: fromId, to_page_id: toId }));
      if (linkRows.length) {
        const { error: linkError } = await supabase.from("wiki_links").upsert(linkRows, {
          onConflict: "from_page_id,to_page_id",
          ignoreDuplicates: true,
        });
        if (linkError) errors.push(`"${concept.title}" 링크 저장 실패: ${linkError.message}`);
      }
    }

    // 3차: extend/edit은 바로 반영하지 않고 승인 대기열에 넣는다.
    for (const concept of concepts.filter((c) => c.action === "extend" || c.action === "edit")) {
      const targetId = concept.target_title ? titleToId.get(concept.target_title) : undefined;
      if (!targetId) {
        errors.push(`"${concept.title}" (${concept.action}) 대상 문서 "${concept.target_title}"를 찾지 못해 건너뜀`);
        continue;
      }
      const { error: pendingError } = await supabase.from("pending_changes").insert({
        user_id: user.id,
        source_chunk_id: chunk.id,
        target_page_id: targetId,
        change_type: concept.action,
        proposed_title: concept.title,
        proposed_definition: concept.definition,
        proposed_points: concept.points,
        proposed_links: concept.links,
        reason: concept.reason ?? null,
      });
      if (pendingError) {
        errors.push(`"${concept.title}" 대기열 등록 실패: ${pendingError.message}`);
        continue;
      }
      pendingChangeCount++;
    }

    await supabase.from("text_chunks").update({ processed_at: new Date().toISOString() }).eq("id", chunk.id);
  }

  const { count: remaining } = await supabase
    .from("text_chunks")
    .select("id", { count: "exact", head: true })
    .eq("source_file_id", sourceFile.id)
    .is("processed_at", null);

  return NextResponse.json({
    ok: true,
    done: (remaining ?? 0) === 0,
    processed: chunks.length,
    remaining: remaining ?? 0,
    new_pages: newPageCount,
    pending_changes: pendingChangeCount,
    quota_exceeded: quotaExceeded,
    errors,
  });
}
