// Phase 6/8 공용: Gemini 429(RESOURCE_EXHAUSTED, 무료 등급 할당량 초과) 에러 메시지 판별.
// AI 호출부(gemini.ts, quiz-gemini.ts) 양쪽이 똑같은 판별 로직을 쓰기 때문에 한 곳으로 뺐다.
export function isQuotaExceededMessage(message: string): boolean {
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|status.*429/i.test(message);
}
