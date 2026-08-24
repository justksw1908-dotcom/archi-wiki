"use client";

// NavBar에서 쓰는 로그아웃 버튼. 서버 컴포넌트인 NavBar 안에서 onClick을 직접 못 써서 따로 뺐다.
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COLORS } from "@/lib/theme";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/wiki");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: "7px 16px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 8,
        border: `1px solid ${COLORS.borderStrong}`,
        background: "#fff",
        cursor: "pointer",
        color: COLORS.textMuted,
      }}
    >
      로그아웃
    </button>
  );
}
