"use client";

// Phase 6: 아직 퀴즈가 없는 문서들에 AI로 퀴즈를 만드는 버튼. 한 번 호출에 몇 문서씩만 처리하므로
// 다 끝날 때까지 반복 호출한다 (업로드 페이지의 AI 위키 생성 버튼과 같은 방식).
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Progress = {
  status: "idle" | "running" | "done" | "error";
  processed: number;
  created: number;
  message?: string;
};

export default function GenerateQuizButton({ initiallyDone }: { initiallyDone: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ status: "idle", processed: 0, created: 0 });

  const start = useCallback(async () => {
    setProgress({ status: "running", processed: 0, created: 0 });
    let totalProcessed = 0;
    let totalCreated = 0;
    let prevRemaining: number | null = null;
    let stuckStreak = 0;

    for (;;) {
      try {
        const res = await fetch("/api/quiz/generate", { method: "POST" });
        const data = await res.json();
        if (!data.ok) {
          setProgress({ status: "error", processed: totalProcessed, created: totalCreated, message: data.message ?? "생성 실패" });
          return;
        }

        totalProcessed += data.processed ?? 0;
        totalCreated += data.created ?? 0;

        // 같은 문서에서 계속 실패해서 남은 개수가 줄지 않으면(예: 매번 API 오류) 무한 루프를 막는다.
        if (typeof data.remaining === "number") {
          stuckStreak = data.remaining === prevRemaining ? stuckStreak + 1 : 0;
          prevRemaining = data.remaining;
        }

        setProgress({
          status: "running",
          processed: totalProcessed,
          created: totalCreated,
          message: data.errors?.length ? data.errors.join(" / ") : undefined,
        });

        if (data.done) {
          setProgress((prev) => ({ ...prev, status: "done" }));
          router.refresh();
          return;
        }
        if (stuckStreak >= 2) {
          setProgress((prev) => ({
            ...prev,
            status: "error",
            message: prev.message ?? "같은 문서에서 계속 실패해서 멈췄어요. 잠시 후 다시 눌러보세요.",
          }));
          router.refresh();
          return;
        }
      } catch (e) {
        setProgress({ status: "error", processed: totalProcessed, created: totalCreated, message: e instanceof Error ? e.message : "네트워크 오류" });
        return;
      }
    }
  }, [router]);

  if (initiallyDone && progress.status === "idle") {
    return <p style={{ fontSize: 13, color: "#888" }}>모든 문서에 퀴즈가 있어요.</p>;
  }

  if (progress.status === "idle") {
    return (
      <button
        onClick={start}
        style={{ padding: "8px 16px", fontSize: 13.5, borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer" }}
      >
        AI로 퀴즈 생성 시작
      </button>
    );
  }

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 13.5,
        background: progress.status === "error" ? "#F8E5E1" : "#F0F2F6",
        border: `1px solid ${progress.status === "error" ? "#E8B9AC" : "#D3D9E3"}`,
      }}
    >
      {progress.status === "running" && "생성 중... "}
      {progress.status === "done" && "생성 완료. "}
      {progress.status === "error" && "오류 발생. "}
      처리한 문서 {progress.processed}개 · 생성된 퀴즈 {progress.created}개
      {progress.message && (
        <>
          <br />
          <span style={{ color: "#888" }}>{progress.message}</span>
        </>
      )}
    </div>
  );
}
