"use client";

// Phase 6 (수정): 퀴즈를 만들 범위를 장/절/개별 문서 단위로 직접 골라서 생성한다.
// "한 번에 다 만들면 Gemini 할당량을 거의 다 써버릴 것 같다"는 요청으로, 예전의
// "AI로 퀴즈 생성 시작"(전체 일괄) 버튼을 이 화면으로 대체했다.
//
// 디자인 라운드: 파란색/보라색 강조를 브랜드 컬러(red/orange)로 통일했다. 트리 구조 자체는
// 기능 그대로 두고 카드·배지 스타일만 다시 그렸다.
//
// AI 에이전트 확장 라운드: 이 화면은 middleware가 로그인 없인 아예 못 들어오게 막아서(/quiz/select는
// PUBLIC_EXACT_PATHS/PUBLIC_PREFIX_PATHS 어디에도 없음) 여기 렌더링됐다는 것 자체가 로그인 상태라는
// 뜻이다 — 이 컴포넌트가 클라이언트 컴포넌트라 서버에서처럼 auth.getUser()를 직접 부를 수 없어서,
// 다른 화면들처럼 조회해서 넘기는 대신 loggedIn을 true로 고정한다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import { parseSection } from "@/lib/parse-section";
import AgentChatWidget from "../../AgentChatWidget";

type Item = { id: string; title: string; section: string; has_quiz: boolean };
type ParsedItem = Item & { chapter: string; sectionNum: string; label: string };

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />;
}

type Progress = {
  status: "idle" | "running" | "done" | "error" | "quota";
  total: number;
  processed: number;
  created: number;
  message?: string;
};

// Gemini 무료 등급은 모델당 하루 요청 수가 20회로 매우 적고(2026-08 기준), 태평양 시간 자정에
// 초기화된다. 한국 시간으로 대략 언제쯤인지 안내 메시지에 같이 보여준다 (여름엔 PDT=UTC-7 -> 자정=한국 16시,
// 겨울엔 PST=UTC-8 -> 자정=한국 17시 — 정확한 절기 계산 대신 대략적인 안내로 충분하다).
const QUOTA_RESET_HINT = "태평양 시간 자정(한국 시간으로 대략 오후 4~5시경)에 초기화돼요.";

const BATCH_SIZE = 3;

export default function QuizSelectPage() {
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({ status: "idle", total: 0, processed: 0, created: 0 });

  useEffect(() => {
    // 페이지에 들어오자마자 문서 목록 + 퀴즈 생성 여부를 한 번 불러온다 — 마운트 시 1회성 조회.
    load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/quiz/scope");
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "불러오기 실패");
        return;
      }
      setError(null);
      setItems((data.items as Item[]).map((it) => ({ ...it, ...parseSection(it.section) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  const chapters = useMemo(() => {
    if (!items) return [];
    const chapterMap = new Map<string, ParsedItem[]>();
    for (const it of items) {
      if (!chapterMap.has(it.chapter)) chapterMap.set(it.chapter, []);
      chapterMap.get(it.chapter)!.push(it);
    }
    return [...chapterMap.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([chapter, docs]) => {
        const sectionMap = new Map<string, ParsedItem[]>();
        for (const d of docs) {
          if (!sectionMap.has(d.sectionNum)) sectionMap.set(d.sectionNum, []);
          sectionMap.get(d.sectionNum)!.push(d);
        }
        const sections = [...sectionMap.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([sectionNum, sdocs]) => ({ sectionNum, docs: sdocs }));
        return { chapter, docs, sections };
      });
  }, [items]);

  const allSelectableIds = useMemo(() => (items ?? []).filter((it) => !it.has_quiz).map((it) => it.id), [items]);

  function selectableIds(docs: ParsedItem[]) {
    return docs.filter((d) => !d.has_quiz).map((d) => d.id);
  }

  function stateFor(ids: string[]) {
    const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
    return {
      checked: ids.length > 0 && selectedCount === ids.length,
      indeterminate: selectedCount > 0 && selectedCount < ids.length,
    };
  }

  function toggleIds(ids: string[]) {
    const { checked } = stateFor(ids);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleExpand(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  const start = async () => {
    const queue = [...selectedIds];
    if (queue.length === 0) return;
    setProgress({ status: "running", total: queue.length, processed: 0, created: 0 });
    let processed = 0;
    let created = 0;
    let createdViaGroq = 0;
    let createdViaOllama = 0;
    let quotaHit = false;
    const errorMessages: string[] = [];

    while (queue.length) {
      const batch = queue.splice(0, BATCH_SIZE);
      try {
        const res = await fetch("/api/quiz/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_ids: batch }),
        });
        const data = await res.json();
        if (!data.ok) {
          errorMessages.push(data.message ?? "생성 실패");
        } else {
          created += data.created ?? 0;
          createdViaGroq += data.created_via_groq ?? 0;
          createdViaOllama += data.created_via_ollama ?? 0;
          if (data.errors?.length) errorMessages.push(...data.errors);
          if (data.quota_exceeded) quotaHit = true;
        }
      } catch (e) {
        errorMessages.push(e instanceof Error ? e.message : "네트워크 오류");
      }
      processed += batch.length;

      const fallbackNote =
        [
          createdViaGroq > 0 ? `Groq로 만든 것 ${createdViaGroq}개` : null,
          createdViaOllama > 0 ? `로컬 Ollama로 만든 것 ${createdViaOllama}개` : null,
        ]
          .filter(Boolean)
          .join(", ") || "";

      if (quotaHit) {
        // Gemini 할당량을 넘고 Groq·로컬 Ollama도 못 쓸 때만 여기로 온다(둘 중 하나라도 쓸 수 있으면
        // 자동으로 대신 생성돼서 quota_exceeded 자체가 안 켜짐). 남은 문서들은 API를 다시 부르지 않고
        // 여기서 바로 멈춘다. 아직 처리 못 한 나머지(이번 배치의 스킵분 + 큐에 남은 것)는 선택을 풀지
        // 않고 그대로 둬서, 내일 할당량이 초기화된 뒤 다시 누르기만 하면 이어서 만들 수 있게 한다.
        setProgress({
          status: "quota",
          total: processed + queue.length,
          processed,
          created,
          message: `오늘의 무료 API 할당량(모델당 하루 20회)을 다 썼어요.${fallbackNote ? ` (그중 ${fallbackNote} 포함)` : ""} ${QUOTA_RESET_HINT} 선택은 그대로 남겨뒀으니 내일 "생성" 버튼만 다시 누르면 이어서 만들어요. (.env.local에 GROQ_API_KEY를 설정하거나 컴퓨터에 Ollama를 설치해두면 할당량이 다 떨어져도 자동으로 이어서 만들어요 — README 참고.)`,
        });
        return;
      }

      setProgress({
        status: "running",
        total: processed + queue.length,
        processed,
        created,
        message: [errorMessages.length ? errorMessages.join(" / ") : null, fallbackNote ? `${fallbackNote} 포함` : null]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
    }

    setProgress((prev) => ({ ...prev, status: errorMessages.length ? "error" : "done" }));
    setSelectedIds(new Set());
    load(); // has_quiz 최신 상태로 다시 불러오기
  };

  if (error) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
        <p style={{ color: COLORS.dangerText }}>오류: {error}</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
        <p style={{ color: COLORS.textFaint }}>불러오는 중...</p>
      </div>
    );
  }

  const allState = stateFor(allSelectableIds);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 60px", fontFamily: FONT_FAMILY, background: COLORS.bg }}>
      <Link href="/quiz" style={{ fontSize: 13, color: COLORS.textFainter, textDecoration: "none" }}>
        ← 퀴즈 허브
      </Link>
      <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.3, margin: "14px 0 4px", color: COLORS.text }}>
        퀴즈 생성 범위 선택
      </h1>
      <p style={{ color: COLORS.textFaint, fontSize: 13.5, marginBottom: 18, lineHeight: 1.6 }}>
        장 · 절 · 개별 문서 단위로 골라서 그 범위만 AI로 퀴즈를 만들어요. 이미 퀴즈가 있는 문서는 목록에서
        &ldquo;생성됨&rdquo;으로 표시되고 다시 안 만들어요.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 14, fontWeight: 700, color: COLORS.text }}>
        <TriCheckbox checked={allState.checked} indeterminate={allState.indeterminate} onChange={() => toggleIds(allSelectableIds)} />
        전체 선택 (아직 퀴즈 없는 문서 {allSelectableIds.length}개)
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        {chapters.map((ch) => {
          const chIds = selectableIds(ch.docs);
          const chState = stateFor(chIds);
          const chExpanded = expandedChapters.has(ch.chapter);
          return (
            <div key={ch.chapter} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TriCheckbox checked={chState.checked} indeterminate={chState.indeterminate} onChange={() => toggleIds(chIds)} disabled={chIds.length === 0} />
                <button
                  onClick={() => toggleExpand(expandedChapters, setExpandedChapters, ch.chapter)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0, flex: 1, textAlign: "left", color: COLORS.text }}
                >
                  {chExpanded ? "▾" : "▸"} {ch.chapter}장{" "}
                  <span style={{ color: COLORS.textFainter, fontSize: 12.5 }}>
                    (남음 {chIds.length} / 전체 {ch.docs.length})
                  </span>
                </button>
              </div>

              {chExpanded && (
                <div style={{ marginTop: 8, marginLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
                  {ch.sections.map((sec) => {
                    const secIds = selectableIds(sec.docs);
                    const secState = stateFor(secIds);
                    const secKey = `${ch.chapter}-${sec.sectionNum}`;
                    const secExpanded = expandedSections.has(secKey);
                    return (
                      <div key={secKey}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <TriCheckbox checked={secState.checked} indeterminate={secState.indeterminate} onChange={() => toggleIds(secIds)} disabled={secIds.length === 0} />
                          <button
                            onClick={() => toggleExpand(expandedSections, setExpandedSections, secKey)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, padding: 0, flex: 1, textAlign: "left", color: COLORS.text }}
                          >
                            {secExpanded ? "▾" : "▸"} {sec.sectionNum}절{" "}
                            <span style={{ color: COLORS.textFainter, fontSize: 12 }}>
                              (남음 {secIds.length} / 전체 {sec.docs.length})
                            </span>
                          </button>
                        </div>

                        {secExpanded && (
                          <div style={{ marginTop: 4, marginLeft: 24, display: "flex", flexDirection: "column", gap: 4 }}>
                            {sec.docs.map((doc) => (
                              <label key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(doc.id)}
                                  disabled={doc.has_quiz}
                                  onChange={() => toggleIds([doc.id])}
                                />
                                <span style={{ color: doc.has_quiz ? COLORS.textFainter : COLORS.text }}>{doc.title}</span>
                                {doc.has_quiz && (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.successText }}>생성됨</span>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ position: "sticky", bottom: 0, background: COLORS.bg, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
        <button
          onClick={start}
          disabled={selectedIds.size === 0 || progress.status === "running"}
          style={{
            padding: "11px 20px",
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 10,
            border: "none",
            background: selectedIds.size === 0 ? COLORS.chipBg : COLORS.red,
            color: selectedIds.size === 0 ? COLORS.textFainter : "#fff",
            cursor: selectedIds.size === 0 ? "default" : "pointer",
            marginBottom: 10,
          }}
        >
          선택한 {selectedIds.size}개 문서에 퀴즈 생성
        </button>

        {progress.status !== "idle" && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13.5,
              background: progress.status === "error" ? COLORS.dangerBg : progress.status === "quota" ? COLORS.warningBg : COLORS.bgSubtle,
              border: `1px solid ${progress.status === "error" ? COLORS.dangerBorder : progress.status === "quota" ? COLORS.warningBorder : COLORS.border}`,
              color: COLORS.text,
            }}
          >
            {progress.status === "running" && "생성 중... "}
            {progress.status === "done" && "생성 완료. "}
            {progress.status === "error" && "일부 오류가 있었어요. "}
            {progress.status === "quota" && "할당량 초과로 멈췄어요. "}
            {progress.processed} / {progress.total}개 처리 · 생성된 퀴즈 {progress.created}개
            {progress.message && (
              <>
                <br />
                <span style={{ color: COLORS.textFaint }}>{progress.message}</span>
              </>
            )}
          </div>
        )}
      </div>

      <AgentChatWidget loggedIn={true} />
    </div>
  );
}
