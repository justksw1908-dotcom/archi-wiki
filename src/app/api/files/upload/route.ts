// Phase 3: 파일 업로드 → Storage 저장 → 텍스트 추출 → 청킹 → text_chunks 저장.
// AI를 호출하지 않는 순수 처리 라우트. 인증된 사용자의 쿠키 세션으로만 동작하고
// (service role 키를 쓰지 않음) 모든 쓰기는 RLS를 그대로 통과해야 성공한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectFileKind, extractFromPdf, extractFromPlainText } from "@/lib/text-extract";
import { chunkText } from "@/lib/chunking";

// Vercel 서버리스 함수의 요청 본문 크기 제한은 플랜에 따라 다르므로(대략 몇 MB 선),
// 여기서는 앱 차원에서 넉넉히 먼저 막아 사용자에게 바로 이유를 알려준다.
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, step: "input", message: "file 필드가 필요합니다." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, step: "input", message: "빈 파일입니다." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, step: "input", message: `파일이 너무 큽니다 (최대 ${MAX_FILE_BYTES / 1024 / 1024}MB).` },
      { status: 400 }
    );
  }

  const kind = detectFileKind(file.type, file.name);
  if (!kind) {
    return NextResponse.json(
      { ok: false, step: "input", message: "PDF 또는 TXT 파일만 지원합니다." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Storage 키(경로)에는 한글·공백 등이 들어가면 Supabase Storage가 "Invalid key"로 거부한다
  // (실제로 한글 파일명으로 업로드해보다가 확인한 문제). 그래서 저장 경로는 UUID + 확장자만
  // 쓰는 완전한 ASCII 값으로 만들고, 사람이 보는 원래 파일명은 DB의 source_files.filename
  // 컬럼(그냥 텍스트라 이런 제약이 없음)에만 저장한다 — 화면에는 항상 이 filename을 보여준다.
  const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0] : kind === "pdf" ? ".pdf" : ".txt";
  const storagePath = `${user.id}/${crypto.randomUUID()}${ext}`;

  // 1. Storage에 원본 저장
  const { error: uploadError } = await supabase.storage
    .from("source-files")
    .upload(storagePath, bytes, { contentType: file.type || undefined });

  if (uploadError) {
    return NextResponse.json({ ok: false, step: "storage_upload", message: uploadError.message }, { status: 500 });
  }

  // 2. source_files 행 생성
  const { data: sourceFile, error: insertError } = await supabase
    .from("source_files")
    .insert({
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      mime_type: file.type || (kind === "pdf" ? "application/pdf" : "text/plain"),
      byte_size: file.size,
      status: "extracting",
    })
    .select()
    .single();

  if (insertError || !sourceFile) {
    return NextResponse.json(
      { ok: false, step: "db_insert_source_file", message: insertError?.message ?? "알 수 없는 오류" },
      { status: 500 }
    );
  }

  // 3. 텍스트 추출 (실패하면 source_files.status를 failed로 남기고 에러 반환)
  try {
    const extracted = kind === "pdf" ? await extractFromPdf(bytes) : extractFromPlainText(bytes);

    if (!extracted.text.trim()) {
      await supabase.from("source_files").update({ status: "failed" }).eq("id", sourceFile.id);
      return NextResponse.json(
        { ok: false, step: "extract", message: "파일에서 텍스트를 찾지 못했습니다 (스캔 이미지 PDF일 수 있어요)." },
        { status: 422 }
      );
    }

    const chunks = chunkText(extracted.text);

    const { error: chunksError } = await supabase.from("text_chunks").insert(
      chunks.map((content, index) => ({
        user_id: user.id,
        source_file_id: sourceFile.id,
        chunk_index: index,
        content,
      }))
    );

    if (chunksError) {
      await supabase.from("source_files").update({ status: "failed" }).eq("id", sourceFile.id);
      return NextResponse.json({ ok: false, step: "db_insert_chunks", message: chunksError.message }, { status: 500 });
    }

    await supabase.from("source_files").update({ status: "extracted" }).eq("id", sourceFile.id);

    return NextResponse.json({
      ok: true,
      source_file_id: sourceFile.id,
      filename: file.name,
      page_count: extracted.pageCount,
      chunk_count: chunks.length,
      preview: chunks[0]?.slice(0, 200),
    });
  } catch (e) {
    await supabase.from("source_files").update({ status: "failed" }).eq("id", sourceFile.id);
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, step: "extract", message }, { status: 500 });
  }
}
