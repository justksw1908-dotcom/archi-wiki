// Phase 10 후속 (디자인 라운드): 화면들이 공유하는 색상·폰트 토큰.
// "시안을 보자"로 확정한 방향(학습도구답게 밝고 친근하게, 흰색 + 붉은~주황 계열, SK하이닉스 브랜드 컬러
// 참고)을 실제 코드 전체에서 일관되게 쓰기 위해 값을 한 군데로 모았다. 이 프로젝트는 인라인 style을
// 쓰는 기존 관례를 그대로 따르므로, 이 파일은 CSS가 아니라 그 인라인 style들이 가져다 쓰는 상수 모음이다.
export const COLORS = {
  bg: "#ffffff",
  bgSubtle: "#FFFBF9",
  text: "#262220",
  textMuted: "#6B6360",
  textFaint: "#8A827D",
  textFainter: "#B8ADA8",
  border: "#EFE6E1",
  borderStrong: "#E4DDD9",
  chipBg: "#F2ECE8",

  red: "#E31837",
  redBg: "#FFF7F2",
  redBorder: "#F6D9CC",

  orange: "#F58025",

  success: "#3FA55A",
  successBg: "#F3FAF3",
  successBorder: "#CFEBD1",
  successText: "#2C7A42",
  successTextMuted: "#5C8A66",

  danger: "#D6503A",
  dangerBg: "#FDEDEA",
  dangerBorder: "#F3C4B8",
  dangerText: "#B23A2E",

  warning: "#C98A1F",
  warningBg: "#FDF3DF",
  warningBorder: "#EFD79E",
  warningText: "#8A6A1F",
} as const;

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI", sans-serif';
