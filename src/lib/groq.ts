// Phase 10 후속(AI 에이전트 라운드): Gemini 무료 할당량(모델당 하루 20회, 2026-08 기준)을 다 썼을 때
// 자동으로 대신 써주는 클라우드 폴백. 기존 Ollama 폴백(src/lib/ollama.ts)은 "이 코드가 지금
// 실행되는 컴퓨터"에서만 되는 로컬 전용이라 배포된 사이트에서는 못 썼는데, Groq는 그냥 인터넷
// 너머의 API라서 로컬이든 배포 환경(Vercel)이든 똑같이 동작한다. 위키 우측 하단 AI 에이전트
// (채팅) 기능도 이 클라이언트를 통해 Groq를 쓴다.
//
// Groq는 신용카드 등록 없이 무료 계정만 만들어도(https://console.groq.com) 하루 약 1,000회까지
// 쓸 수 있어서(모델별로 다름) Gemini(하루 20회)보다 훨씬 넉넉하다. OpenAI 호환 REST API라 별도
// SDK 없이 fetch로 바로 호출한다(ollama.ts와 같은 방식).
//
// 모델은 2026-08 기준 Groq의 "프로덕션" 등급인 openai/gpt-oss-20b를 기본값으로 쓴다. Gemini
// 2.5-flash가 어느 날 갑자기 폐지됐던 것처럼 Groq도 모델을 자주 바꾸니, 이 기본값이 404가 나면
// .env.local의 GROQ_MODEL만 https://console.groq.com/docs/models 에서 확인한 새 모델명으로
// 바꿔주면 된다(코드 수정 불필요).
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const CHAT_TIMEOUT_MS = 30_000;

export type GroqChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class GroqNotConfiguredError extends Error {}
export class GroqQuotaExceededError extends Error {}
export class GroqGenerationError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Ollama의 isOllamaAvailable()과 같은 역할이지만, Groq는 이 서버가 아니라 인터넷 너머에 있는
// API라서 살아있는지 매번 핑을 보낼 필요가 없다 — 키가 설정돼 있는지만 확인한다.
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

async function callGroqChat(messages: GroqChatMessage[], opts?: { jsonMode?: boolean }): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqNotConfiguredError("GROQ_API_KEY가 설정되어 있지 않습니다.");

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.6,
          ...(opts?.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      CHAT_TIMEOUT_MS
    );
  } catch (e) {
    throw new GroqGenerationError(e instanceof Error ? e.message : "Groq에 연결할 수 없습니다.");
  }

  if (response.status === 429) {
    throw new GroqQuotaExceededError("Groq 무료 할당량을 초과했습니다.");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GroqGenerationError(`Groq API 오류 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new GroqGenerationError("Groq 응답이 비어 있습니다.");
  }
  return content;
}

// gemini.ts/quiz-gemini.ts가 Ollama 경로에서 쓰는 ollamaGenerateJson과 같은 역할 — 프롬프트 +
// JSON 스키마를 주면, 그 스키마 모양을 프롬프트에 명시해서 JSON 모드로 응답을 받아온다(Groq의
// response_format은 OpenAI의 느슨한 "json_object" 모드까지만 확실히 걸 수 있어서, 필드별 스키마
// 검증까지는 강제하지 못한다 — 실제 파싱·검증·정제·재시도는 호출하는 쪽이 Gemini/Ollama 경로에서
// 쓰던 로직을 그대로 재사용한다).
export async function groqGenerateJson(prompt: string, schema: object): Promise<string> {
  const fullPrompt = [
    prompt,
    "",
    "반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 응답하세요 (다른 설명·코드블록 없이 JSON만):",
    JSON.stringify(schema),
  ].join("\n");
  return callGroqChat([{ role: "user", content: fullPrompt }], { jsonMode: true });
}

// AI 에이전트(위키 우측 하단 채팅)용 — 스키마 없이 자유 형식 대화 응답을 받아온다.
export async function groqChatReply(messages: GroqChatMessage[]): Promise<string> {
  return callGroqChat(messages);
}
