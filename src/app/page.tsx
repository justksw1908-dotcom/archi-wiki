import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black font-sans">
      <main className="max-w-md w-full px-6 py-10 text-center">
        <h1 className="text-2xl font-semibold mb-2">건축공학 학습 위키</h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">위키 열람 · AI 생성 · 업로드 · 퀴즈</p>

        {user ? (
          <div className="text-sm space-y-2">
            <p>
              로그인됨: <strong>{user.email?.split("@")[0] ?? user.email}</strong>
            </p>
            <p className="text-zinc-500">
              <Link href="/wiki" className="underline font-medium">
                /wiki
              </Link>
              에서 위키 문서를 읽고 검색하고 편집해보세요.
            </p>
            <p className="text-zinc-500">
              <Link href="/upload" className="underline font-medium">
                /upload
              </Link>
              에서 PDF·TXT 파일을 올리고 AI로 위키 문서를 생성해보세요.
            </p>
            <p className="text-zinc-500">
              <Link href="/pending" className="underline font-medium">
                /pending
              </Link>
              에서 AI가 제안한 기존 문서 수정/추가를 승인·거절할 수 있어요.
            </p>
            <p className="text-zinc-500">
              <Link href="/quiz" className="underline font-medium">
                /quiz
              </Link>
              에서 AI로 만든 퀴즈를 풀고 채점 결과를 볼 수 있어요.
            </p>
            <p className="text-zinc-500">
              <a href="/api/dev-check" className="underline">
                /api/dev-check
              </a>
              로 Supabase 저장/조회 연결을 확인해보세요.
            </p>
          </div>
        ) : (
          <div className="text-sm text-zinc-500 space-y-2">
            <p>
              <Link href="/wiki" className="underline font-medium">
                /wiki
              </Link>
              에서 로그인 없이 바로 위키를 둘러볼 수 있어요.
            </p>
            <p>
              편집하거나 새 문서·퀴즈를 만들려면{" "}
              <Link href="/login" className="underline">
                로그인
              </Link>
              이 필요해요.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
