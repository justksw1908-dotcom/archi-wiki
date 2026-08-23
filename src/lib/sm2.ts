// Phase 7: 망각곡선(SM-2, SuperMemo 2) 계산 — 전부 순수 코드, AI 호출 없음.
// quiz_attempts는 시도할 때마다 한 줄씩 쌓이는 로그 표라, 문제 하나의 "현재" SM-2 상태는
// 그 문제의 가장 최근 시도 행(ease_factor/interval_days/repetitions)이다. 이 파일은
// (이전 상태, 이번 정오답)을 받아서 다음 상태를 계산하는 순수 함수만 담는다 — DB나 API와 무관.
export type Sm2State = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
};

// 한 번도 안 푼 문제의 초기 상태 (schema.sql의 quiz_attempts 컬럼 기본값과 동일).
export const SM2_DEFAULT: Sm2State = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

// 우리 데이터는 정답/오답(boolean)만 있고 SM-2 원안의 0~5 품질 점수는 없어서 단순 매핑한다:
// 맞으면 5(완벽하게 기억), 틀리면 2(재시작 기준인 3 미만 — repetitions가 0으로 리셋됨).
function qualityFrom(isCorrect: boolean): number {
  return isCorrect ? 5 : 2;
}

// SM-2 원 공식 그대로: https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm
export function computeSm2(prev: Sm2State, isCorrect: boolean): Sm2State {
  const q = qualityFrom(isCorrect);
  const newEaseFactor = Math.max(1.3, prev.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // 틀리면 처음부터 다시 — 내일 한 번 더 보고, 반복 횟수는 리셋.
    return { easeFactor: newEaseFactor, intervalDays: 1, repetitions: 0 };
  }

  const repetitions = prev.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(prev.intervalDays * newEaseFactor);

  return { easeFactor: newEaseFactor, intervalDays, repetitions };
}

// 날짜 계산은 서버 실행 환경의 로컬 타임존에 영향받지 않도록 전부 UTC 기준 getter/setter로 한다
// (new Date() 자체는 항상 특정 시점을 가리키므로 문제없지만, 달력 날짜로 쪼갤 때 로컬 TZ가 섞이면
// 배포 환경마다 next_review_at이 하루씩 밀리는 등 재현 안 되는 버그가 날 수 있어서 방어적으로 통일).
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function toDateOnlyString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
