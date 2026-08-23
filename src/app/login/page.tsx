"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>학습 위키 로그인</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        비밀번호 없이, 이메일로 받은 링크만 클릭하면 로그인돼요.
      </p>
      {status === "sent" ? (
        <p style={{ fontSize: 14 }}>
          <strong>{email}</strong>로 로그인 링크를 보냈어요. 메일함(스팸함도)을 확인해주세요.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            {status === "sending" ? "보내는 중..." : "로그인 링크 받기"}
          </button>
          {status === "error" && (
            <p style={{ color: "#b3261e", fontSize: 13 }}>오류: {errorMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}
