// 매직 링크 이메일 로그인 대신 "아이디 + 비밀번호"로 로그인하기 위한 변환 헬퍼.
// Supabase Auth의 비밀번호 로그인은 내부적으로 이메일 형식을 요구하기 때문에,
// 사용자가 고른 아이디를 이 파일이 정한 규칙대로 가짜(내부 전용) 이메일 주소로
// 바꿔서 Supabase에 보낸다 — 실제 메일이 오가는 주소가 아니라 로그인 식별자로만 쓰인다.
//
// 로그인 폼(src/app/login/page.tsx)과 계정 설정 스크립트(scripts/set-login-credentials.ts)가
// 반드시 이 함수를 통해서만 변환하도록 해서 둘의 규칙이 어긋나지 않게 한다.
export const USERNAME_EMAIL_DOMAIN = "archi-wiki.local";

export function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${USERNAME_EMAIL_DOMAIN}`;
}
