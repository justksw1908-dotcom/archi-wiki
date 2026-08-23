// 업로드된 파일에서 텍스트를 뽑아내는 부분. AI를 쓰지 않는 순수 처리 단계 (Phase 3).
import { extractText, getDocumentProxy } from "unpdf";

export type ExtractResult = {
  text: string;
  pageCount?: number;
};

// 특정 코드포인트보다 작은 C0 제어문자인지 판단 — 탭(9)·개행(10)·캐리지리턴(13)은 허용.
function isDisallowedControlCode(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return false;
  return code < 32;
}

// PDF·TXT에서 텍스트를 뽑은 뒤 반드시 거쳐야 하는 정리 단계.
//
// 실제 워크북 PDF 7개를 전부 뽑아서 테스트해보다가 발견한 문제: 일부 PDF는 특정 기호가
// 폰트의 유니코드 매핑이 안 돼 있어서 제어문자(코드 0)로 추출된다. 이 문자가 든 문자열을
// 그대로 Supabase(PostgREST)에 저장하려고 하면 "unsupported Unicode escape sequence"
// 에러로 저장 자체가 실패하는 것까지 로컬 Postgres로 재현해서 확인했다. 그래서 텍스트를
// DB에 넣기 전에 반드시 이 정리 단계를 거친다 — 특정 파일 하나만 손보는 게 아니라 추출
// 파이프라인 자체에 공통 안전장치로 넣어둔다.
export function sanitizeExtractedText(raw: string): string {
  let cleaned = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (!isDisallowedControlCode(code)) cleaned += raw[i];
  }
  return cleaned
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{3,}/g, "  ");
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: sanitizeExtractedText(text), pageCount: totalPages };
}

export function extractFromPlainText(bytes: Uint8Array): ExtractResult {
  const text = new TextDecoder("utf-8").decode(bytes);
  return { text: sanitizeExtractedText(text) };
}

export const SUPPORTED_MIME_TYPES: Record<string, "pdf" | "txt"> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
};

export function detectFileKind(mimeType: string, filename: string): "pdf" | "txt" | null {
  if (SUPPORTED_MIME_TYPES[mimeType]) return SUPPORTED_MIME_TYPES[mimeType];
  if (filename.toLowerCase().endsWith(".pdf")) return "pdf";
  if (filename.toLowerCase().endsWith(".txt")) return "txt";
  return null;
}
