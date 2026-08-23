// 텍스트를 AI(Gemini) 입력 단위로 쓸 청크로 나누는 순수 함수 — AI 호출 없음, 여기선 토큰 안 씀.
//
// PDF에서 뽑은 텍스트는 실제 문단 사이에도 빈 줄이 없는 경우가 흔해서(줄바꿈만 있고
// 문단 구분이 없음 — unpdf로 실제 워크북 PDF를 뽑아보고 확인함), "빈 줄로 문단 나누기"에만
// 의존하면 청크가 하나로 뭉쳐버린다. 그래서 이렇게 2단계로 처리한다:
//   1) 빈 줄(2개 이상 개행)이 있으면 그걸로 먼저 문단을 나눈다 (사용자가 직접 쓴 .txt 등에 유리).
//   2) 문단이 여전히 너무 크면(빈 줄이 아예 없는 PDF 텍스트 포함) 줄 단위로 다시 그리디하게
//      묶어서 MAX_CHARS를 넘지 않는 조각으로 만든다 — 문장·줄 중간을 끊지 않는다.
// 너무 작은 조각(예: 짧은 제목 한 줄)은 다음 조각과 합쳐서, Phase 4에서 청크 하나당 AI 호출이
// 한 번씩 나가는 구조상 자잘한 청크가 난립해 호출 수(=비용)가 늘어나는 걸 막는다.

export const MAX_CHUNK_CHARS = 1800;
export const MIN_CHUNK_CHARS = 200;

export function chunkText(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, "\n");

  // 1) 빈 줄 기준 1차 분리 (없으면 전체가 문단 하나)
  const paragraphs = normalized
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // 2) 각 문단을 줄 단위로 그리디하게 MAX_CHUNK_CHARS 이하로 재포장
  const packed: string[] = [];
  for (const paragraph of paragraphs) {
    packed.push(...packLines(paragraph));
  }

  // 3) 너무 작은 조각은 다음 조각과 합치기 (마지막 조각은 예외적으로 그냥 둠)
  return mergeSmallChunks(packed);
}

function packLines(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];

  const lines = paragraph.split("\n");
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  for (const line of lines) {
    const candidate = buffer ? buffer + "\n" + line : line;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      buffer = candidate;
      continue;
    }
    // 지금 버퍼를 닫고 새로 시작
    flush();
    if (line.length <= MAX_CHUNK_CHARS) {
      buffer = line;
    } else {
      // 한 줄 자체가 MAX_CHUNK_CHARS보다 긴 극단적인 경우 — 문자 수 기준 하드 분할 (최후 수단)
      for (let i = 0; i < line.length; i += MAX_CHUNK_CHARS) {
        chunks.push(line.slice(i, i + MAX_CHUNK_CHARS));
      }
    }
  }
  flush();
  return chunks;
}

function mergeSmallChunks(chunks: string[]): string[] {
  const result: string[] = [];
  let buffer = "";

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = chunk;
      continue;
    }
    if (buffer.length < MIN_CHUNK_CHARS && buffer.length + chunk.length + 1 <= MAX_CHUNK_CHARS) {
      buffer = buffer + "\n" + chunk;
    } else {
      result.push(buffer);
      buffer = chunk;
    }
  }
  if (buffer) result.push(buffer);
  return result;
}
