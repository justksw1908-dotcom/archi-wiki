// Phase 10 후속(퀴즈 절 선택 라운드): 위키 문서의 section 문자열("N장 · ... · N절 · ...")에서
// 장·절 번호를 뽑아낸다. /quiz/select 페이지에 있던 걸 여기로 옮기고 로직을 더 튼튼하게 고쳤다.
//
// 버그였던 부분: 예전 정규식(`/^(\d+)장\s*·\s*(\d+)절\s*·\s*(.*)$/`)은 "장" 바로 다음에 "절"이
// 온다고 가정했다. 그런데 실제 데이터를 보니 2장만 유독 "2장 · I 콘크리트재료 · 1절 · 시멘트 · ..."처럼
// 장과 절 사이에 대분류가 하나 더 끼어 있어서, 2장 문서 268개 전부가 "절 없음(0절)" 취급되고
// 있었다(/quiz/select의 절 아코디언에서 2장만 절 구분이 안 되던 문제). 장 번호는 맨 앞에서,
// 절 번호는 문자열 어디에 있든 따로 찾도록 고쳤다.
export type ParsedSection = { chapter: string; sectionNum: string; label: string };

export function parseSection(section: string): ParsedSection {
  const chapterMatch = section.match(/^(\d+)장/);
  const chapter = chapterMatch ? chapterMatch[1] : "기타";

  const sectionMatch = section.match(/(\d+)절/);
  const sectionNum = sectionMatch ? sectionMatch[1] : "0";

  const label = sectionMatch
    ? section
        .slice(section.indexOf(sectionMatch[0]) + sectionMatch[0].length)
        .replace(/^\s*·\s*/, "")
        .trim()
    : section.replace(/^(\d+)장\s*·?\s*/, "").trim();

  return { chapter, sectionNum, label: label || section };
}
