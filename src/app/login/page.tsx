"use client";

// Phase 10 (로드맵 이후 추가 요청): 이메일 매직 링크 대신 아이디+비밀번호로 로그인한다.
// 개인 프로젝트라 회원가입 화면은 없다 — 계정은 scripts/set-login-credentials.ts로
// 미리 한 번 만들어두는 걸 전제로 한다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth-username";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      setStatus("error");
      // Supabase가 "이메일 또는 비밀번호가 틀렸다"는 걸 굳이 구분해서 알려주지 않는다
      // (계정이 있는지 없는지 추측 못 하게 하려는 보안상 관례) — 그대로 보여준다.
      setErrorMsg(error.message === "Invalid login credentials" ? "아이디 또는 비밀번호가 올바르지 않아요." : error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>학습 위키 로그인</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        위키 열람은 로그인 없이도 가능해요. 문서를 편집하거나 AI로 새로 생성하려면 로그인이 필요해요.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          required
          autoComplete="username"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            border: "none",
            background: "#2F6F62",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {status === "sending" ? "로그인 중..." : "로그인"}
        </button>
        {status === "error" && (
          <p style={{ color: "#b3261e", fontSize: 13 }}>오류: {errorMsg}</p>
        )}
      </form>
    </div>
  );
}
