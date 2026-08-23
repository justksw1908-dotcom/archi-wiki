// 브라우저(클라이언트 컴포넌트)에서 쓰는 Supabase 클라이언트.
// anon key만 사용 — 이 키는 RLS로 보호되므로 브라우저에 노출돼도 안전하다.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
