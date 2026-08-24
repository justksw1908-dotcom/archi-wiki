// 요청마다 로그인 세션을 갱신하고, 로그인 안 된 사용자를 /login으로 보내는 로직.
// 개인 프로젝트라 회원가입은 없고, 아이디+비밀번호 로그인 하나만 사용한다.
//
// Phase 10 (로드맵 이후 추가 요청): 위키 열람(/wiki, /wiki/[id])은 로그인 없이도 되게 열어뒀다.
// 편집 저장(PATCH /api/wiki/pages/[id])과 AI 생성(/api/wiki/generate, /api/quiz/generate)은
// 이 목록에 없으므로 여전히 로그인이 필요하다 — 게다가 그 라우트들 자체도 각자 auth.getUser()로
// 한 번 더 확인해서 401을 돌려주고(DB의 RLS 정책으로도 한 번 더 막힘) 이중으로 보호된다.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/wiki"];

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
  // "/"는 정확히 일치할 때만 공개 처리 — PUBLIC_PATHS를 startsWith로 검사하다 보니
  // 여기에 "/"를 그냥 넣으면 모든 경로가 "/"로 시작해서 사이트 전체가 공개돼버리는
  // 실수를 막기 위해 홈은 따로 취급한다.
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
