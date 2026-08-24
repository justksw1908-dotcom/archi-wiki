"use client";

// NavBar(서버 컴포넌트)에서 분리한 이유: 현재 탭에 밑줄을 그리려면 현재 경로(usePathname)가
// 필요한데, 그건 클라이언트 컴포넌트에서만 쓸 수 있다. 로그인 여부를 읽는 부분은 서버에 그대로 두고
// (그래야 서버에서 바로 렌더돼서 깜빡임이 없다), 경로만 아는 이 부분만 따로 뺐다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { COLORS } from "@/lib/theme";

const NAV_LINKS = [
  { href: "/wiki", label: "위키" },
  { href: "/quiz", label: "퀴즈" },
];

export default function NavLinks({ showUploadLinks }: { showUploadLinks: boolean }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function linkStyle(href: string) {
    const active = isActive(href);
    return {
      fontSize: 13.5,
      fontWeight: active ? 700 : 500,
      color: active ? COLORS.text : COLORS.textMuted,
      padding: "4px 2px",
      borderBottom: active ? `2px solid ${COLORS.red}` : "2px solid transparent",
    };
  }

  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {NAV_LINKS.map((link) => (
        <Link key={link.href} href={link.href} style={linkStyle(link.href)}>
          {link.label}
        </Link>
      ))}
      {showUploadLinks && (
        <>
          <Link href="/upload" style={linkStyle("/upload")}>
            업로드
          </Link>
          <Link href="/pending" style={linkStyle("/pending")}>
            승인대기
          </Link>
        </>
      )}
    </nav>
  );
}
