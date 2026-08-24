// 요청마다 로그인 세션을 갱신하고, 로그인 안 된 사용자를 /login으로 보내는 로직.
// 개인 프로젝트라 회원가입은 없고, 아이디+비밀번호 로그인 하나만 사용한다.
//
// Phase 10 (로드맵 이후 추가 요청): 위키 열람(/wiki, /wiki/[id])과 퀴즈 풀이(/quiz, /quiz/practice)는
// 로그인 없이도 되게 열어뒀다. 편집 저장(PATCH /api/wiki/pages/[id]), AI 생성(/api/wiki/generate,
// /api/quiz/generate), 퀴즈 생성 화면(/quiz/select), 복습(/quiz/review — 개인 진행 기록이라
// 로그인한 본인 것만 의미가 있어서 계속 막아둠), 업로드(/upload)·승인대기열(/pending)은 이
// 목록에 없으므로 여전히 로그인이 필요하다 — 게다가 그 라우트들 자체도 각자 auth.getUser()로
// 한 번 더 확인해서 401을 돌려주고(DB의 RLS 정책으로도 한 번 더 막힘) 이중으로 보호된다.
//
// "/quiz"는 정확히 일치할 때만 공개 처리한다 — startsWith였다면 "/quiz/select"·"/quiz/review"까지
// 같이 공개돼버려서 안 된다("/"를 따로 취급하는 것과 같은 이유).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = ["/", "/quiz"];
const PUBLIC_PREFIX_PATHS = [
  "/login",
  "/auth/callback",
  "/wiki",
  "/quiz/practice",
  "/api/quiz/practice",
  "/api/quiz/attempts",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PREFIX_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
