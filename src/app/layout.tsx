import type { Metadata } from "next";
import "./globals.css";
import NavBar from "./NavBar";

// 콘텐츠가 대부분 한글이라 Google Fonts(라틴 위주) 대신 OS 기본 시스템 폰트를 사용 —
// 별도 웹폰트 다운로드 없이도 각 OS의 한글 폰트(맑은 고딕/Apple SD 산돌고딕 등)로 자연스럽게 표시된다.
export const metadata: Metadata = {
  title: "건축공학 학습 위키",
  description: "업로드한 학습 자료를 AI로 정리한 개인용 학습 위키 · 퀴즈 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
