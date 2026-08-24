// AI 에이전트 라운드: 위키 우측 하단 채팅 위젯의 백엔드.
// Gemini/Ollama 폴백 체인과 달리 이 기능은 Groq 하나만 쓴다 — 가벼운 대화용이라 굳이 Gemini
// 할당량(하루 20회)을 여기서까지 나눠 쓸 필요가 없고, Groq 쪽이 훨씬 넉넉하다(하루 약 1,000회).
//
// 기존 AI 기능들(위키 생성·퀴즈 생성)과 같은 이유로 로그인을 요구한다 — 로그인 없이 열어두면
// 익명 사용자가 무료 API 할당량을 소진해버릴 수 있다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GroqNotConfiguredError, GroqQuotaExceededError, groqChatReply, type GroqChatMessage } from "@/lib/groq";

type ChatBody = {
  message?: string;
  history?: { role?: string; content?: string }[];
  context?: {
    title?: string;
    section?: string;
    definition?: string;
    points?: string[];
  } | null;
};

const MAX_MESSAGE_LENGTH = 1000;
// 대화가 길어질수록 매 요청마다 프롬프트에 통째로 다시 넣어야 하는 비용이 커지므로,
// 최근 몇 턴만 유지한다 — 가벼운 잡담용 위젯이라 긴 문맥 유지는 필요하지 않다.
const MAX_HISTORY_TURNS = 8;

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, step: "auth", message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, step: "input", message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ ok: false, step: "input", message: "메시지를 입력해주세요." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { ok: false, step: "input", message: `메시지가 너무 길어요 (최대 ${MAX_MESSAGE_LENGTH}자).` },
      { status: 400 }
    );
  }

  const historyRaw = Array.isArray(body.history) ? body.history : [];
  const history: GroqChatMessage[] = historyRaw
    .filter(
      (h): h is { role: "user" | "assistant"; content: string } =>
        (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string" && h.content.trim().length > 0
    )
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((h) => ({ role: h.role, content: h.content.trim().slice(0, MAX_MESSAGE_LENGTH) }));

  const context = body.context;
  const systemLines = [
    "당신은 건축공학 학습 위키의 AI 에이전트입니다. 학습자가 개념을 이해하도록 친근하고 간결하게 한국어로 답하세요.",
    "확실하지 않은 내용은 지어내지 말고 모른다고 말하세요. 답변은 보통 2~5문장 정도로 짧게 유지하세요.",
  ];
  if (context?.title && context?.definition) {
    systemLines.push(
      "",
      "사용자가 지금 보고 있는 위키 문서:",
      `[${context.section ?? ""}] ${context.title}`,
      context.definition,
      Array.isArray(context.points) && context.points.length ? context.points.map((p) => `- ${p}`).join("\n") : "",
      "",
      "이 문서 내용과 관련된 질문이면 위 내용을 참고해서 답하세요. 관련 없는 질문이면 그냥 일반적으로 답하면 됩니다."
    );
  }

  const messages: GroqChatMessage[] = [
    { role: "system", content: systemLines.filter(Boolean).join("\n") },
    ...history,
    { role: "user", content: message },
  ];

  try {
    const reply = await groqChatReply(messages);
    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    if (e instanceof GroqNotConfiguredError) {
      return NextResponse.json(
        { ok: false, step: "not_configured", message: "AI 에이전트가 아직 설정되지 않았어요 (GROQ_API_KEY 필요)." },
        { status: 503 }
      );
    }
    if (e instanceof GroqQuotaExceededError) {
      return NextResponse.json(
        { ok: false, step: "quota", message: "오늘 AI 에이전트 사용량을 다 썼어요. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, step: "generation", message: `답변 생성에 실패했어요: ${msg}` }, { status: 500 });
  }
}
