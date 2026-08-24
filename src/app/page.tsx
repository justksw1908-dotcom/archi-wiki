// Phase 10 후속 (로드맵 이후 추가 요청): "접속하면 바로 위키가 보이게" — 위키가 기본 화면이라
// 홈("/")은 그냥 /wiki로 보낸다. 예전에 여기 있던 대시보드(업로드/승인대기/퀴즈 링크, 로그인 상태)는
// 모든 화면에 공통으로 뜨는 상단 내비게이션(src/app/NavBar.tsx)으로 옮겼다.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/wiki");
}
