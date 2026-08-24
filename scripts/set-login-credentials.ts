// Phase 10 (로드맵 이후 추가 요청): 이메일 매직 링크 로그인을 아이디+비밀번호로 바꾸면서,
// 기존에 매직 링크로 만들어뒀던 단 하나의 계정에 아이디·비밀번호를 설정해주는 1회성 관리자 스크립트.
//
// 이 계정의 user_id는 그대로 유지된다 — 그래서 지금까지 쌓인 위키 문서·퀴즈·복습 기록이
// 전부 user_id로 연결되어 있는데도 전혀 영향이 없다. 바뀌는 건 "로그인에 쓰는 이메일 주소"뿐이고,
// 그 값도 실제로 메일이 오가는 주소가 아니라 아이디를 이메일 형식으로 흉내낸 내부 전용 문자열이다
// (src/lib/auth-username.ts의 usernameToEmail와 반드시 같은 규칙을 써야 해서 그 함수를 그대로 가져온다).
//
// 실행: 프로젝트 루트(package.json이 있는 폴더)에서
//   npx tsx scripts/set-login-credentials.ts <아이디> <비밀번호>
// 예:
//   npx tsx scripts/set-login-credentials.ts sunwoong myStrongPass123
//
// 비밀번호를 나중에 바꾸고 싶을 때도 이 스크립트를 아이디는 그대로, 비밀번호만 다르게 해서
// 다시 실행하면 돼요(몇 번을 다시 실행해도 안전 — 매번 그 시점 값으로 덮어쓸 뿐이다).

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../src/lib/auth-username";

function loadEnvLocal(): Record<string, string> {
  const path = ".env.local";
  if (!existsSync(path)) {
    console.error(".env.local 파일을 못 찾았어요. study-wiki-app 폴더(package.json이 있는 그 폴더)에서 실행해주세요.");
    process.exit(1);
  }
  const text = readFileSync(path, "utf8");
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("사용법: npx tsx scripts/set-login-credentials.ts <아이디> <비밀번호>");
    console.error("예:     npx tsx scripts/set-login-credentials.ts sunwoong myStrongPass123");
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    console.error("아이디는 영문·숫자·._- 만 쓸 수 있어요(내부적으로 이메일 형식으로 변환되기 때문이에요).");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("비밀번호는 6자 이상이어야 해요(Supabase 기본 최소 길이).");
    process.exit(1);
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(".env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 있어야 해요.");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userList, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    console.error("계정 목록을 못 가져왔어요:", listError.message);
    process.exit(1);
  }
  if (userList.users.length === 0) {
    console.error(
      "아직 계정이 하나도 없어요 — 이 스크립트는 '기존에 로그인해본 적 있는' 계정에 비밀번호를 얹는 용도예요. " +
        "Supabase 대시보드 → Authentication → Users에서 계정을 하나 먼저 만든 뒤 다시 실행해주세요."
    );
    process.exit(1);
  }
  if (userList.users.length > 1) {
    console.error(
      `계정이 ${userList.users.length}개 있어요 — 개인용 앱이라 1개를 기대했는데 여러 개가 있으면 ` +
        "어느 계정에 적용할지 이 스크립트가 자동으로 판단하면 위험해서 여기서 멈춰요. 알려주시면 스크립트를 손봐드릴게요."
    );
    process.exit(1);
  }

  const user = userList.users[0];
  const newEmail = usernameToEmail(username);

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    password,
    email_confirm: true, // 확인 메일을 실제로 보내지 않고(어차피 못 받는 가짜 주소) 바로 확정 처리
  });

  if (updateError) {
    console.error("계정 업데이트 실패:", updateError.message);
    process.exit(1);
  }

  console.log(`완료! 이제 /login에서 아이디 "${username}" / 방금 설정한 비밀번호로 로그인할 수 있어요.`);
  console.log(`(내부적으로는 이 계정의 로그인 이메일이 "${newEmail}"로 바뀐 거예요 — 실제 메일 주소가 아니라 로그인용 문자열일 뿐이라, 기존에 쌓인 위키 문서·퀴즈 기록에는 전혀 영향 없어요.)`);
}

main();
