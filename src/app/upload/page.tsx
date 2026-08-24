"use client";

// AI 에이전트 확장 라운드: 이 화면은 middleware가 로그인 없인 아예 못 들어오게 막아두므로(/upload는
// 공개 경로 목록에 없음) 여기 렌더링됐다는 것 자체가 로그인 상태라는 뜻이다 — 클라이언트 컴포넌트라
// 서버에서처럼 auth.getUser()를 직접 부를 수 없어서, loggedIn을 true로 고정해 넘긴다.
import { useCallback, useRef, useState } from "react";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import AgentChatWidget from "../AgentChatWidget";

type UploadResult = {
  ok: boolean;
  step?: string;
  message?: string;
  source_file_id?: string;
  filename?: string;
  page_count?: number;
  chunk_count?: number;
  preview?: string;
};

type GenerateProgress = {
  status: "idle" | "running" | "done" | "error" | "quota";
  processed: number;
  remaining: number;
  newPages: number;
  pendingChanges: number;
  message?: string;
};

// Phase 8: Gemini 무료 등급은 모델당 하루 요청 수가 20회로 낮고(2026-08 기준), 태평양 시간
// 자정에 초기화된다. 컴퓨터에 Ollama가 켜져 있으면 할당량 초과 시 자동으로 대신 생성되니
// 이 메시지는 "Ollama도 안 될 때"만 뜬다.
const QUOTA_RESET_HINT = "태평양 시간 자정(한국 시간으로 대략 오후 4~5시경)에 초기화돼요.";

export default function UploadPage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [gen, setGen] = useState<GenerateProgress>({ status: "idle", processed: 0, remaining: 0, newPages: 0, pendingChanges: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStatus("uploading");
    setResult(null);
    setGen({ status: "idle", processed: 0, remaining: 0, newPages: 0, pendingChanges: 0 });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
      setStatus(data.ok ? "done" : "error");
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "네트워크 오류" });
      setStatus("error");
    }
  }, []);

  const startGenerate = useCallback(async (sourceFileId: string) => {
    setGen({ status: "running", processed: 0, remaining: 0, newPages: 0, pendingChanges: 0 });
    let totalProcessed = 0;
    let totalNewPages = 0;
    let totalPendingChanges = 0;

    // 한 번 호출에 청크 몇 개만 처리하므로(서버리스 실행 시간 제한 때문), 다 끝날 때까지 반복 호출한다.
    for (;;) {
      try {
        const res = await fetch("/api/wiki/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_file_id: sourceFileId }),
        });
        const data = await res.json();
        if (!data.ok) {
          setGen({
            status: "error",
            processed: totalProcessed,
            remaining: 0,
            newPages: totalNewPages,
            pendingChanges: totalPendingChanges,
            message: data.message ?? "생성 실패",
          });
          return;
        }

        totalProcessed += data.processed ?? 0;
        totalNewPages += data.new_pages ?? 0;
        totalPendingChanges += data.pending_changes ?? 0;

        if (data.quota_exceeded) {
          // Gemini 할당량 초과 + 로컬 Ollama도 못 쓸 때만 여기로 온다. 남은 청크는 API를 더
          // 안 부르고 멈춘다 — processed_at이 안 찍힌 청크들은 나중에 이 버튼을 다시 누르면
          // 이어서 처리돼요.
          setGen({
            status: "quota",
            processed: totalProcessed,
            remaining: data.remaining ?? 0,
            newPages: totalNewPages,
            pendingChanges: totalPendingChanges,
            message: `오늘의 무료 API 할당량(모델당 하루 20회)을 다 썼어요. ${QUOTA_RESET_HINT} 나중에 이 버튼을 다시 누르면 이어서 처리돼요. (컴퓨터에 Ollama를 설치해두면 할당량이 다 떨어져도 자동으로 이어서 만들어요 — README의 Phase 8 참고.)`,
          });
          return;
        }

        setGen({
          status: "running",
          processed: totalProcessed,
          remaining: data.remaining ?? 0,
          newPages: totalNewPages,
          pendingChanges: totalPendingChanges,
          message: data.errors?.length ? data.errors.join(" / ") : undefined,
        });

        if (data.done) {
          setGen((prev) => ({ ...prev, status: "done" }));
          return;
        }
      } catch (e) {
        setGen({
          status: "error",
          processed: totalProcessed,
          remaining: 0,
          newPages: totalNewPages,
          pendingChanges: totalPendingChanges,
          message: e instanceof Error ? e.message : "네트워크 오류",
        });
        return;
      }
    }
  }, []);

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "60px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.3, marginBottom: 8, color: COLORS.text }}>
        학습 자료 업로드
      </h1>
      <p style={{ color: COLORS.textFaint, fontSize: 13.5, marginBottom: 26, lineHeight: 1.6 }}>
        PDF 또는 TXT 파일을 올리면 AI가 텍스트를 읽고 위키 문서로 정리해요.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 16,
          padding: "44px 20px",
          textAlign: "center",
          cursor: "pointer",
          color: COLORS.textFaint,
          fontSize: 14,
          background: COLORS.bgSubtle,
        }}
      >
        {status === "uploading" ? "업로드 중..." : "클릭하거나 파일을 여기로 끌어다 놓으세요 (PDF/TXT)"}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {result && (
        <div
          style={{
            marginTop: 20,
            padding: "16px 18px",
            borderRadius: 14,
            fontSize: 13.5,
            background: result.ok ? COLORS.successBg : COLORS.dangerBg,
            border: `1px solid ${result.ok ? COLORS.successBorder : COLORS.dangerBorder}`,
            whiteSpace: "pre-wrap",
            color: COLORS.text,
          }}
        >
          {result.ok ? (
            <>
              <strong>{result.filename}</strong> 처리 완료
              <br />
              페이지 {result.page_count}쪽 · 청크 {result.chunk_count}개
              <br />
              <span style={{ color: COLORS.textFaint }}>미리보기: {result.preview}...</span>
            </>
          ) : (
            <>
              오류 ({result.step}): {result.message}
            </>
          )}
        </div>
      )}

      {result?.ok && result.source_file_id && (
        <div style={{ marginTop: 16 }}>
          {gen.status === "idle" && (
            <button
              onClick={() => startGenerate(result.source_file_id!)}
              style={{
                padding: "9px 18px",
                fontSize: 13.5,
                fontWeight: 700,
                borderRadius: 10,
                border: "none",
                background: COLORS.red,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              AI로 위키 문서 생성 시작
            </button>
          )}

          {gen.status !== "idle" && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 14,
                fontSize: 13.5,
                background: gen.status === "error" ? COLORS.dangerBg : gen.status === "quota" ? COLORS.warningBg : COLORS.bgSubtle,
                border: `1px solid ${gen.status === "error" ? COLORS.dangerBorder : gen.status === "quota" ? COLORS.warningBorder : COLORS.border}`,
                color: COLORS.text,
              }}
            >
              {gen.status === "running" && "생성 중... "}
              {gen.status === "done" && "생성 완료. "}
              {gen.status === "error" && "오류 발생. "}
              {gen.status === "quota" && "할당량 초과로 멈췄어요. "}
              처리한 청크 {gen.processed}개 · 새 문서 {gen.newPages}개 · 승인 대기 {gen.pendingChanges}개
              {gen.pendingChanges > 0 && (
                <>
                  {" "}
                  <a href="/pending" style={{ color: COLORS.red, fontWeight: 700, textDecoration: "underline" }}>
                    /pending
                  </a>
                  에서 확인하세요.
                </>
              )}
              {gen.message && (
                <>
                  <br />
                  <span style={{ color: COLORS.textFaint }}>{gen.message}</span>
                </>
              )}
              {(gen.status === "quota" || gen.status === "error") && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => startGenerate(result!.source_file_id!)}
                    style={{
                      padding: "7px 16px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: `1px solid ${COLORS.borderStrong}`,
                      background: "#fff",
                      color: COLORS.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    이어서 다시 시도
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AgentChatWidget loggedIn={true} />
    </div>
  );
}
