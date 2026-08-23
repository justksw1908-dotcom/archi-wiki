// 서버(서버 컴포넌트 · API 라우트 · 서버 액션)에서 쓰는 Supabase 클라이언트.
// 쿠키에 담긴 로그인 세션을 읽어서 RLS의 auth.uid()가 채워지게 한다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 쿠키를 못 쓸 수 있음 —
            // 미들웨어가 세션 갱신을 대신 처리하므로 무시해도 됨.
          }
        },
      },
    }
  );
}

// Gemini 호출, 관리자성 작업 등 RLS를 우회해야 하는 서버 전용 작업에만 사용.
// service role key는 절대 브라우저로 내려가면 안 됨 — API 라우트 안에서만 import.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
