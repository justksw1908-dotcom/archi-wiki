// Phase 10 후속 (로드맵 이후 추가 요청): 모든 화면 위에 공통으로 뜨는 상단 내비게이션.
// 예전엔 "/"(홈)에만 있던 위키·업로드·승인대기·퀴즈 링크와 로그인 상태 표시를 여기로 옮겼다 —
// 이제 "/"는 바로 /wiki로 넘어가버려서, 이 링크들을 볼 곳이 따로 있어야 한다.
// 위키·퀴즈는 로그인 없이도 갈 수 있고, 업로드·승인대기는 로그인해야 의미가 있어서 로그인했을 때만 보여준다.
//
// 디자인 라운드: 시안(https://claude.ai/code/artifact/e1cf08e4-1f3c-4519-a60a-49e507e2fa04)의
// 상단 내비 — 점 세 개 로고, 굵은 워드마크, 현재 탭 밑줄, 우측 로그인 상태 — 를 그대로 옮겼다.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { COLORS, FONT_FAMILY } from "@/lib/theme";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: 64,
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
        flexWrap: "wrap",
        gap: 10,
        rowGap: 10,
        fontFamily: FONT_FAMILY,
        background: COLORS.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <Link href="/wiki" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <svg width="24" height="24" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6" cy="19" r="3.4" fill={COLORS.orange} />
            <circle cx="20" cy="19" r="3.4" fill={COLORS.red} />
            <circle cx="13" cy="6" r="3.4" fill={COLORS.red} />
            <path d="M9 17.5L11.5 9" stroke="#D9D0CB" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M17 17.5L14.5 9" stroke="#D9D0CB" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: -0.2, color: COLORS.text }}>
            건축공학 학습 위키
          </span>
        </Link>
        <NavLinks showUploadLinks={Boolean(user)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {user ? (
          <>
            <span style={{ fontSize: 12.5, color: COLORS.textFainter }}>{user.email?.split("@")[0] ?? user.email}</span>
            <LogoutButton />
          </>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "7px 16px",
              borderRadius: 8,
              background: COLORS.red,
              color: "#fff",
              textDecoration: "none",
            }}
          >
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
