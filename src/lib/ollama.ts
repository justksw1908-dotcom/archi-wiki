// Phase 8: Gemini 무료 할당량이 다 떨어졌을 때, 사용자 컴퓨터에서 돌고 있는 로컬 Ollama로
// 대체 생성하는 부분.
//
// 중요한 전제: Ollama는 "이 코드가 지금 실행되고 있는 컴퓨터"에서만(기본 127.0.0.1:11434) 접근
// 가능하다. 즉:
//   - `npm run dev`로 자기 컴�터에서 돌릴 때는 Ollama도 같은 컴퓨터에 있으면 정상적으로 닿는다.
//   - Vercel 등에 배포한 뒤(Phase 9) 서버에서 실행되는 코드는 사용자의 개인 컴퓨터에 있는
//     Ollama에 절대 닿을 수 없다 — 다른 기계니까.
//   - 폰이나 다른 사람 컴퓨터로 접속했을 때도 마찬가지.
// 그래서 매번 쓰기 전에 짧은 타임아웃으로 "지금 이 서버에서 Ollama가 응답하는지"부터 확인하고,
// 응답이 없으면 그냥 폴백을 안 쓰는 것으로 조용히 처리한다 — 이게 "기능을 못 쓰는 환경이면
// 안내만 하고 우아하게 넘어간다"는 요구사항의 핵심이다. 에러를 던지지 않고 false만 돌려준다.
const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "llama3.1";

const HEALTH_CHECK_TIMEOUT_MS = 1500;
const GENERATE_TIMEOUT_MS = 120_000; // 로컬 LLM은 클라우드보다 느릴 수 있어서 넉넉하게 잡는다.

export class OllamaUnavailableError extends Error {}
export class OllamaGenerationError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Ollama가 지금 이 서버에서 응답하는지 가볍게 확인한다 (모델 목록 조회 — 실제 생성 요청보다 훨씬 빠름).
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/tags`, { method: "GET" }, HEALTH_CHECK_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

// 프롬프트 + JSON 스키마를 그대로 Ollama에 던져서 스키마에 맞는 JSON 문자열을 받아온다.
// Gemini 쪽의 responseJsonSchema와 같은 역할 — 실제 파싱·검증·정제·재시도는 호출하는 쪽
// (gemini.ts, quiz-gemini.ts)이 Gemini 경로에서 쓰던 로직을 그대로 재사용한다.
export async function ollamaGenerateJson(prompt: string, schema: object): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${BASE_URL}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, prompt, stream: false, format: schema }),
      },
      GENERATE_TIMEOUT_MS
    );
  } catch (e) {
    throw new OllamaUnavailableError(e instanceof Error ? e.message : "Ollama에 연결할 수 없습니다.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new OllamaGenerationError(`Ollama 응답 오류 (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  if (typeof data.response !== "string" || !data.response.trim()) {
    throw new OllamaGenerationError("Ollama 응답이 비어 있습니다.");
  }
  return data.response;
}
