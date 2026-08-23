// Phase 6/8: Gemini로 위키 문서 하나당 퀴즈 여러 개를 한 번만 생성해서 캐싱하는 부분.
// 채점은 절대 AI를 다시 부르지 않는다 — 객관식/OX/빈칸/서술형 전부 코드로 정답·허용 표현을 비교한다.
// Phase 8: Gemini 무료 할당량을 다 썼을 때, 사용 가능하면 로컬 Ollama로 대신 생성한다(generateQuizItemsAuto).
import { GoogleGenAI } from "@google/genai";
import { sanitizeExtractedText } from "./text-extract";
import { isQuotaExceededMessage } from "./ai-quota";
import { isOllamaAvailable, ollamaGenerateJson } from "./ollama";

export type QuizType = "multiple_choice" | "fill_blank" | "true_false" | "short_answer";

export type GeminiQuizItem = {
  type: QuizType;
  stem: string;
  choices?: string[];
  correct_choice?: string;
  correct_bool?: boolean;
  correct_text?: string;
  answer_variants?: string[];
};

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["multiple_choice", "fill_blank", "true_false", "short_answer"] },
          stem: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          correct_choice: { type: "string" },
          correct_bool: { type: "boolean" },
          correct_text: { type: "string" },
          answer_variants: { type: "array", items: { type: "string" } },
        },
        required: ["type", "stem"],
      },
    },
  },
  required: ["items"],
};

const MODEL = "gemini-3.6-flash";
const MAX_ATTEMPTS = 3;

function buildPrompt(pageTitle: string, section: string, definition: string, points: string[]): string {
  return [
    "당신은 학습자를 위해 복습 퀴즈를 만드는 출제자입니다.",
    "아래 [위키 문서]를 바탕으로 이 문서 하나에 대한 퀴즈를 2~4개 만드세요. 형식은 아래 4가지 중에서 내용에 자연스럽게 맞는 것들로 섞어서 고르세요(전부 다 쓸 필요는 없어요).",
    "",
    "- multiple_choice: stem(문제), choices(정확히 4개, 그 중 정답 1개 포함, 오답은 같은 분야에서 그럴듯하지만 명백히 틀린 것으로), correct_choice(choices 중 정답과 완전히 똑같은 문자열)",
    "- true_false: stem에 참/거짓을 판단할 진술문을 적고, correct_bool(true 또는 false)",
    "- fill_blank: stem에 핵심 용어나 숫자를 '___'로 가린 문장, correct_text(정답), answer_variants(같은 뜻의 다른 표현이 있으면 배열로, 없으면 빈 배열)",
    "- short_answer: stem에 서술형 질문, correct_text(모범답안, 짧게), answer_variants(채점 시 정답으로 인정할 다른 표현들 — 어미 차이, 축약, 동의어 등을 최대한 채워주세요. 채점은 AI를 다시 부르지 않고 이 목록과 정확히 대조하기 때문에 중요합니다)",
    "",
    "이미지가 필요한 문제는 만들지 마세요(이 문서에는 이미지가 없다고 가정).",
    "",
    `[위키 문서] ${section} · ${pageTitle}`,
    definition,
    points.length ? points.map((p) => `- ${p}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function isValidItem(raw: unknown): raw is GeminiQuizItem {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.stem !== "string" || !o.stem.trim()) return false;

  if (o.type === "multiple_choice") {
    if (!Array.isArray(o.choices) || o.choices.length < 3) return false;
    if (!o.choices.every((c) => typeof c === "string" && c.trim())) return false;
    if (typeof o.correct_choice !== "string") return false;
    const choices = o.choices as string[];
    return choices.some((c) => c.trim() === (o.correct_choice as string).trim());
  }
  if (o.type === "true_false") {
    return typeof o.correct_bool === "boolean";
  }
  if (o.type === "fill_blank" || o.type === "short_answer") {
    if (typeof o.correct_text !== "string" || !o.correct_text.trim()) return false;
    if (o.answer_variants !== undefined && !Array.isArray(o.answer_variants)) return false;
    return true;
  }
  return false;
}

function sanitizeItem(item: GeminiQuizItem): GeminiQuizItem {
  return {
    type: item.type,
    stem: sanitizeExtractedText(item.stem).trim(),
    choices: item.choices?.map((c) => sanitizeExtractedText(c).trim()),
    correct_choice: item.correct_choice ? sanitizeExtractedText(item.correct_choice).trim() : undefined,
    correct_bool: item.correct_bool,
    correct_text: item.correct_text ? sanitizeExtractedText(item.correct_text).trim() : undefined,
    answer_variants: item.answer_variants?.map((v) => sanitizeExtractedText(v).trim()).filter(Boolean) ?? [],
  };
}

export class QuizGenerationError extends Error {}

// 무료 등급 일일/분당 할당량(429 RESOURCE_EXHAUSTED)에 걸린 경우 — 스키마 오류와 달리 "다시 시도"로
// 해결되는 게 아니라서(자정까지 기다려야 함) 별도 타입으로 구분해서, 재시도 루프를 낭비하지 않고
// 즉시 포기하고 호출한 쪽(라우트)이 남은 문서 처리를 전부 멈추도록 한다.
export class QuizQuotaExceededError extends QuizGenerationError {}

// 위키 문서 하나에 대한 퀴즈 후보 목록을 Gemini에서 받아온다. 최대 MAX_ATTEMPTS번까지 재시도.
// 단, 할당량 초과는 재시도해도 소용없으므로(자정 초기화 전까지는 계속 429) 첫 시도에서 바로 포기한다.
export async function generateQuizItems(
  pageTitle: string,
  section: string,
  definition: string,
  points: string[]
): Promise<GeminiQuizItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new QuizGenerationError("GEMINI_API_KEY가 설정되어 있지 않습니다.");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(pageTitle, section, definition, points);

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: attempt === 1 ? prompt : `${prompt}\n\n(이전 시도가 스키마에 맞지 않았습니다: ${lastError}\n반드시 스키마에 맞는 JSON만 출력하세요.)`,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      });
      const rawText = response.text;
      if (!rawText) throw new Error("응답이 비어 있습니다.");

      const parsed = JSON.parse(rawText);
      const items = parsed?.items;
      if (!Array.isArray(items) || items.length === 0) throw new Error("items 배열이 비어있습니다.");

      const invalidIndex = items.findIndex((it) => !isValidItem(it));
      if (invalidIndex !== -1) throw new Error(`items[${invalidIndex}]가 스키마에 맞지 않습니다.`);

      return items.map((it) => sanitizeItem(it as GeminiQuizItem));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (isQuotaExceededMessage(lastError)) {
        throw new QuizQuotaExceededError("무료 할당량을 초과했습니다.");
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new QuizGenerationError(`Gemini 퀴즈 생성 실패 (${MAX_ATTEMPTS}회 시도): ${lastError}`);
      }
    }
  }

  throw new QuizGenerationError("도달할 수 없는 코드 경로");
}

export type GenerationSource = "gemini" | "ollama";

// Phase 8: generateQuizItems를 먼저 시도하고, 딱 "할당량 초과"일 때만 로컬 Ollama로 대신
// 만들어본다. Ollama가 지금 이 서버에서 안 닿으면(배포된 서버·폰 등) 원래의 할당량 초과
// 오류를 그대로 던진다 — 호출하는 쪽(라우트)은 지금까지 하던 대로 QuizQuotaExceededError만
// 확인하면 되고, 폴백 성공 시에만 source가 "ollama"로 바뀐다.
export async function generateQuizItemsAuto(
  pageTitle: string,
  section: string,
  definition: string,
  points: string[]
): Promise<{ items: GeminiQuizItem[]; source: GenerationSource }> {
  try {
    const items = await generateQuizItems(pageTitle, section, definition, points);
    return { items, source: "gemini" };
  } catch (e) {
    if (!(e instanceof QuizQuotaExceededError)) throw e;

    const available = await isOllamaAvailable();
    if (!available) throw e;

    try {
      const prompt = buildPrompt(pageTitle, section, definition, points);
      const rawText = await ollamaGenerateJson(prompt, RESPONSE_JSON_SCHEMA);
      const parsed = JSON.parse(rawText);
      const items = parsed?.items;
      if (!Array.isArray(items) || items.length === 0) throw new Error("items 배열이 비어있습니다.");
      const invalidIndex = items.findIndex((it) => !isValidItem(it));
      if (invalidIndex !== -1) throw new Error(`items[${invalidIndex}]가 스키마에 맞지 않습니다.`);
      return { items: items.map((it) => sanitizeItem(it as GeminiQuizItem)), source: "ollama" };
    } catch (ollamaError) {
      const message = ollamaError instanceof Error ? ollamaError.message : String(ollamaError);
      throw new QuizGenerationError(`Gemini 할당량 초과 + 로컬 Ollama도 실패: ${message}`);
    }
  }
}
