// Phase 4/8: Gemini로 텍스트 청크에서 위키 개념을 뽑아내는 부분.
// 반드시 서버에서만 호출한다.
// Phase 8: Gemini 무료 할당량을 다 썼을 때, 사용 가능하면 로컬 Ollama로 대신 생성한다(generateWikiConceptsAuto).
// Phase 10 후속(AI 에이전트 라운드): Ollama보다 먼저 Groq를 시도한다 — Groq는 배포 환경에서도
// 되는 클라우드 API라서(Ollama는 로컬 전용) 실질적으로 더 자주 성공한다.
import { GoogleGenAI } from "@google/genai";
import { sanitizeExtractedText } from "./text-extract";
import { isQuotaExceededMessage } from "./ai-quota";
import { isOllamaAvailable, ollamaGenerateJson } from "./ollama";
import { isGroqConfigured, groqGenerateJson } from "./groq";

export type ConceptAction = "new" | "extend" | "edit";

export type GeminiConcept = {
  action: ConceptAction;
  target_title?: string;
  section: string;
  title: string;
  definition: string;
  points: string[];
  links: string[];
  reason?: string;
};

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["new", "extend", "edit"] },
          target_title: { type: "string" },
          section: { type: "string" },
          title: { type: "string" },
          definition: { type: "string" },
          points: { type: "array", items: { type: "string" } },
          links: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: ["action", "section", "title", "definition", "points", "links"],
      },
    },
  },
  required: ["concepts"],
};

const MODEL = "gemini-3.6-flash";
const MAX_ATTEMPTS = 3;

function buildPrompt(chunkText: string, existingTitles: string[]): string {
  return [
    "당신은 전문 분야 학습 자료를 읽고 위키 문서로 정리하는 편집자입니다.",
    "",
    "아래 [본문]에서 다룰 만한 개념(용어)들을 뽑아 각각 위키 문서 형태로 정리하세요.",
    "",
    "작업 방식:",
    "1. 본문에서 독립적으로 정의할 만한 용어/개념을 찾습니다. 서로 밀접하게 비교되는 개념(예: A와 B를 항상 같이 비교 설명)은 하나의 문서로 묶어도 됩니다.",
    "2. 각 개념에 대해 다음을 판단합니다.",
    "   - new: [기존 문서 제목 목록]에 없는 완전히 새로운 개념 — 이게 기본값입니다. 애매하면 new를 선택하세요.",
    "   - extend: [기존 문서 제목 목록]에 사실상 동일한 제목이 있고, 본문에 그 문서에 없을 만한 진짜 새로운 정보가 있는 경우만. target_title에 정확한 기존 제목을 적으세요.",
    "   - edit: 기존 문서 내용이 본문과 명백히 다르거나 틀렸다고 판단되는 경우만(아주 신중하게, 드물게 사용). target_title 필수.",
    "   - extend·edit인 경우 reason에 왜 그렇게 판단했는지 한 문장으로 적으세요.",
    "3. definition은 한두 문장의 명확한 정의, points는 암기 포인트·비교·주의사항을 불릿 형태 문자열 배열로.",
    "4. links에는 이 개념과 관련된 다른 개념의 제목을 적으세요(새로 만드는 개념끼리 연결해도 됩니다).",
    "5. section은 \"N장 · N절 · 소제목\" 형태로 본문 맥락에 맞게 적으세요(정확한 장·절 번호를 모르면 내용 기반 소제목만 적어도 됩니다).",
    "6. 이미지·표·그림에 대한 언급은 무시하고 텍스트 내용만 다루세요.",
    "",
    "[기존 문서 제목 목록] (" + existingTitles.length + "개)",
    existingTitles.length ? existingTitles.join(", ") : "(없음)",
    "",
    "[본문]",
    chunkText,
  ].join("\n");
}

function isValidConcept(c: unknown): c is GeminiConcept {
  if (!c || typeof c !== "object") return false;
  const obj = c as Record<string, unknown>;
  if (!["new", "extend", "edit"].includes(obj.action as string)) return false;
  if (typeof obj.section !== "string" || !obj.section.trim()) return false;
  if (typeof obj.title !== "string" || !obj.title.trim()) return false;
  if (typeof obj.definition !== "string" || !obj.definition.trim()) return false;
  if (!Array.isArray(obj.points) || !obj.points.every((p) => typeof p === "string")) return false;
  if (!Array.isArray(obj.links) || !obj.links.every((l) => typeof l === "string")) return false;
  if ((obj.action === "extend" || obj.action === "edit") && typeof obj.target_title !== "string") return false;
  return true;
}

function sanitizeConcept(c: GeminiConcept): GeminiConcept {
  return {
    ...c,
    section: sanitizeExtractedText(c.section).trim(),
    title: sanitizeExtractedText(c.title).trim(),
    definition: sanitizeExtractedText(c.definition).trim(),
    points: c.points.map((p) => sanitizeExtractedText(p).trim()).filter(Boolean),
    links: c.links.map((l) => sanitizeExtractedText(l).trim()).filter(Boolean),
    target_title: c.target_title ? sanitizeExtractedText(c.target_title).trim() : undefined,
    reason: c.reason ? sanitizeExtractedText(c.reason).trim() : undefined,
  };
}

export class GeminiGenerationError extends Error {}

// 무료 등급 할당량(429 RESOURCE_EXHAUSTED)에 걸린 경우 — quiz-gemini.ts의 QuizQuotaExceededError와
// 같은 이유로 별도 타입으로 구분한다: 재시도로 해결되는 게 아니라서 즉시 포기하고, 호출한 쪽이
// (가능하면) 로컬 Ollama로 넘어가거나 남은 처리를 멈출 수 있게 한다.
export class GeminiQuotaExceededError extends GeminiGenerationError {}

// 청크 텍스트 하나를 Gemini에 보내 위키 개념 후보 목록을 받아온다.
// 깨진 JSON이나 스키마에 안 맞는 응답은 최대 MAX_ATTEMPTS번까지 재시도한다.
export async function generateWikiConcepts(
  chunkText: string,
  existingTitles: string[]
): Promise<GeminiConcept[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiGenerationError("GEMINI_API_KEY가 설정되어 있지 않습니다.");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(chunkText, existingTitles);

  let lastError: string = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let rawText: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: attempt === 1 ? prompt : `${prompt}\n\n(이전 시도의 응답이 JSON 스키마에 맞지 않았습니다: ${lastError}\n반드시 스키마에 맞는 JSON만 출력하세요.)`,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      });
      rawText = response.text;
      if (!rawText) throw new Error("응답이 비어 있습니다.");

      const parsed = JSON.parse(rawText);
      const concepts = parsed?.concepts;
      if (!Array.isArray(concepts)) throw new Error("concepts 배열이 없습니다.");

      const invalidIndex = concepts.findIndex((c) => !isValidConcept(c));
      if (invalidIndex !== -1) throw new Error(`concepts[${invalidIndex}]가 스키마에 맞지 않습니다.`);

      return concepts.map((c) => sanitizeConcept(c as GeminiConcept));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (isQuotaExceededMessage(lastError)) {
        throw new GeminiQuotaExceededError("무료 할당량을 초과했습니다.");
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new GeminiGenerationError(`Gemini 응답 처리 실패 (${MAX_ATTEMPTS}회 시도): ${lastError}`);
      }
    }
  }

  throw new GeminiGenerationError("도달할 수 없는 코드 경로");
}

export type GenerationSource = "gemini" | "groq" | "ollama";

// Phase 8: generateWikiConcepts를 먼저 시도하고, 딱 "할당량 초과"일 때만 대신 만들어본다.
// Phase 10 후속: 순서는 Groq(클라우드, 배포 환경에서도 됨) → Ollama(로컬 전용, 마지막 수단).
// quiz-gemini.ts의 generateQuizItemsAuto와 같은 패턴 — 어느 쪽도 안 되면 원래의 할당량 초과
// 오류를 그대로 던진다.
export async function generateWikiConceptsAuto(
  chunkText: string,
  existingTitles: string[]
): Promise<{ concepts: GeminiConcept[]; source: GenerationSource }> {
  try {
    const concepts = await generateWikiConcepts(chunkText, existingTitles);
    return { concepts, source: "gemini" };
  } catch (e) {
    if (!(e instanceof GeminiQuotaExceededError)) throw e;

    const prompt = buildPrompt(chunkText, existingTitles);

    if (isGroqConfigured()) {
      try {
        const rawText = await groqGenerateJson(prompt, RESPONSE_JSON_SCHEMA);
        const parsed = JSON.parse(rawText);
        const concepts = parsed?.concepts;
        if (!Array.isArray(concepts)) throw new Error("concepts 배열이 없습니다.");
        const invalidIndex = concepts.findIndex((c) => !isValidConcept(c));
        if (invalidIndex !== -1) throw new Error(`concepts[${invalidIndex}]가 스키마에 맞지 않습니다.`);
        return { concepts: concepts.map((c) => sanitizeConcept(c as GeminiConcept)), source: "groq" };
      } catch {
        // Groq도 실패하면(할당량 초과·설정 오류 등) 조용히 Ollama로 넘어간다.
      }
    }

    const available = await isOllamaAvailable();
    if (!available) throw e;

    try {
      const rawText = await ollamaGenerateJson(prompt, RESPONSE_JSON_SCHEMA);
      const parsed = JSON.parse(rawText);
      const concepts = parsed?.concepts;
      if (!Array.isArray(concepts)) throw new Error("concepts 배열이 없습니다.");
      const invalidIndex = concepts.findIndex((c) => !isValidConcept(c));
      if (invalidIndex !== -1) throw new Error(`concepts[${invalidIndex}]가 스키마에 맞지 않습니다.`);
      return { concepts: concepts.map((c) => sanitizeConcept(c as GeminiConcept)), source: "ollama" };
    } catch (ollamaError) {
      const message = ollamaError instanceof Error ? ollamaError.message : String(ollamaError);
      throw new GeminiGenerationError(`Gemini 할당량 초과 + Groq/로컬 Ollama도 실패: ${message}`);
    }
  }
}
