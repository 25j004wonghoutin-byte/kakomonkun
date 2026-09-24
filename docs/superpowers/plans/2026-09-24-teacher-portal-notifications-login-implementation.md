# 教師ポータル・通知・ログイン再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 共通教師アカウント、教師ホームと学生学習状況、掲示板連携、個別通知、確定済みの学生・教師ログイン画面を安全に実装する。

**Architecture:** 役割判定と教師用集計を小さなサーバーサービスへ分離し、教師画面は専用 `TeacherShell`、掲示板と通知は役割別シェルで共有する。通知は追加専用のPostgreSQLテーブルを正本とし、返信・ピン変更と同一トランザクションで発行する。実DB適用には独立した承認ゲートを設ける。

**Tech Stack:** Next.js 16.2.9 App Router、React 19.2.4、TypeScript、Tailwind CSS 4、Prisma 7.8.0、Supabase Auth / PostgreSQL、Node.js 24標準テスト

**Spec:** `docs/superpowers/specs/2026-09-24-teacher-portal-notifications-login-design.md`

## Global Constraints

- 教師の固定表示名は `管理者`。教師にマイページ、称号、名前・自己紹介編集を提供しない。
- 教師の新規掲示板投稿は通常投稿。教師投稿を後からピンした場合だけ固定でき、学生投稿はピンできない。
- 返信通知は投稿者本人以外の返信1件につき1回。固定通知は同じ投稿につき各アクティブ学生へ通算1回。
- 通知一覧は新しい順の1列表示で、個別既読のみ。「返」アイコンと「すべて既読にする」は追加しない。
- ログイン画面はキャラクターなし画像ロゴ、デスクトップ左3:右7、入力欄・ボタン・切替リンクの左端揃え。
- `DATABASE_URL` はアプリのTransaction mode、`DIRECT_URL` はPrisma CLIと管理スクリプト用。
- 既存DB、既存データ、適用済みマイグレーションを削除・初期化しない。`DROP`、`TRUNCATE`、`prisma db push`、`prisma migrate reset` を使わない。
- 実DBへのマイグレーション適用と共有教師アカウントの準備は、接続先と内容を提示してユーザーの明示承認を得てから行う。
- 新しいnpmパッケージと `package.json` の依存関係を追加しない。
- 既存ファイルの文字コード、BOM、改行を維持する。新規リポジトリ文書とSQLはUTF-8・BOMなし・CRLFとする。
- Next.jsコードを書く前に `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`15-route-handlers.md`、`node_modules/next/dist/docs/01-app/02-guides/authentication.md`、`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` を読む。

## Review Focus

- 同じ教師投稿を並行してピン、または解除後に再ピンしても、学生ごとの固定通知は1件のままになること。
- 自己返信では通知されず、別ユーザーの返信は返信ごとに1件だけ通知されること。
- Supabase認証に成功してもアプリ側が教師ロールでなければ、教師セッションを終了して教師画面へ入れないこと。
- 他人の通知IDを既読化しようとした場合、通知の存在を漏らさず404になること。
- 通知対象の投稿が論理削除済みでも、通知一覧が壊れず、その通知だけ既読化できること。

---

## ファイル境界

| ファイル | 責務 |
| --- | --- |
| `supabase/migrations/20260924000000_add_notifications.sql` | 通知テーブル、制約、索引、RLSの追加だけを行う |
| `prisma/schema.prisma`、`prisma/generated/` | Notificationモデルと既存モデルからの関係 |
| `src/lib/notifications/contract.ts`、`cursor.ts` | DB非依存の公開型、表示文、カーソル検査 |
| `src/lib/notifications/read.ts`、`write.ts` | 本人向け通知一覧・未読・個別既読、通知発行 |
| `src/app/api/notifications/**` | 認証、UUID検査、HTTP応答 |
| `src/lib/teacher/identity.ts`、`auth.ts` | 固定名と教師役割の判定、ページ・APIガード |
| `src/lib/teacher/dashboard.ts`、`students.ts` | 教師ホーム、学生一覧、学生詳細の読み取り |
| `src/components/login-layout.tsx`、`teacher-login-form.tsx` | 共通3:7ログイン枠と教師ログイン操作 |
| `src/components/teacher-shell.tsx`、`notification-bell.tsx` | 教師ナビゲーションと共通ベル |
| `src/app/teacher/**` | 教師ホーム、学習状況一覧、学生詳細 |
| `src/app/notifications/**` | 役割共通の通知一覧と個別既読遷移 |
| `src/lib/board/write-comments.ts`、`write-posts.ts` | 掲示板更新と通知発行を同じトランザクションへ統合 |
| `src/app/board/**`、`src/components/role-shell.tsx` | 掲示板を学生・教師のシェルで共有 |
| `scripts/provision-teacher.mjs` | `DIRECT_URL` でアプリ側教師ユーザーだけを安全にupsert |

### Task 1: 通知スキーマとDB非依存契約

**Files:**
- Create: `supabase/migrations/20260924000000_add_notifications.sql`
- Modify: `prisma/schema.prisma`
- Generate: `prisma/generated/`
- Create: `src/lib/notifications/contract.ts`
- Create: `src/lib/notifications/cursor.ts`
- Create: `tests/notifications-schema.test.mjs`
- Create: `tests/notifications-contract.test.mjs`

**Interfaces:**
- Produces: Prisma `Notification` model
- Produces: `NotificationType`, `NotificationView`, `parseNotificationCursor(text)`, `encodeNotificationCursor(value)`, `notificationMessage(value)`

- [ ] **Step 1: スキーマ安全性の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notification migration is additive and deduplicates each event", () => {
  const sql = readFileSync("supabase/migrations/20260924000000_add_notifications.sql", "utf8");
  assert.match(sql, /create table public\.notifications\b/i);
  assert.match(sql, /unique \(recipient_id, type, board_comment_id\)/i);
  assert.match(sql, /unique \(recipient_id, type, board_post_id\)/i);
  assert.match(sql, /unique \(recipient_id, type, title_id\)/i);
  assert.match(sql, /where read_at is null/i);
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|prisma\s+db\s+push)\b/i);
});
```

- [ ] **Step 2: 契約とカーソルの失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notificationMessage,
  notificationTarget,
} from "../src/lib/notifications/contract.ts";
import {
  encodeNotificationCursor,
  parseNotificationCursor,
} from "../src/lib/notifications/cursor.ts";

test("notification presentation has no reply icon contract", () => {
  const reply = { type: "board_reply", actorName: "はると" };
  assert.equal(notificationMessage(reply), "はるとさんが投稿に返信しました");
  assert.equal(notificationTarget({ type: "board_reply", postId: "p1" }), "/board/posts/p1");
  assert.equal(notificationTarget({ type: "board_reply", postId: null }), null);
});

test("notification cursor rejects malformed data", () => {
  const value = {
    createdAt: "2026-09-24T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  };
  assert.deepEqual(parseNotificationCursor(encodeNotificationCursor(value)), value);
  assert.equal(parseNotificationCursor("not-a-cursor"), null);
});
```

- [ ] **Step 3: テストを実行し、対象ファイル未作成で失敗することを確認する。**

Run: `node --test tests/notifications-schema.test.mjs tests/notifications-contract.test.mjs`

Expected: SQLまたは通知モジュールが存在しないためFAIL。

- [ ] **Step 4: 追加専用SQLを作る。**

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete restrict,
  actor_id uuid references public.users(id) on delete restrict,
  type varchar(30) not null check (type in ('board_reply', 'board_pinned', 'title_unlocked')),
  board_post_id uuid references public.board_posts(id) on delete restrict,
  board_comment_id uuid references public.board_comments(id) on delete restrict,
  title_id uuid references public.titles(id) on delete restrict,
  read_at timestamptz(3),
  created_at timestamptz(3) not null default now(),
  constraint notifications_target_check check (
    (type = 'board_reply' and actor_id is not null and board_comment_id is not null and board_post_id is null and title_id is null)
    or (type = 'board_pinned' and actor_id is not null and board_post_id is not null and board_comment_id is null and title_id is null)
    or (type = 'title_unlocked' and actor_id is null and title_id is not null and board_post_id is null and board_comment_id is null)
  ),
  unique (recipient_id, type, board_comment_id),
  unique (recipient_id, type, board_post_id),
  unique (recipient_id, type, title_id)
);

create index idx_notifications_actor_id on public.notifications(actor_id);
create index idx_notifications_board_post_id on public.notifications(board_post_id);
create index idx_notifications_board_comment_id on public.notifications(board_comment_id);
create index idx_notifications_title_id on public.notifications(title_id);
create index idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc, id desc);
create index idx_notifications_recipient_unread
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
```

- [ ] **Step 5: Prismaモデルと逆方向関係を追加する。**

```prisma
model Notification {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipientId    String        @map("recipient_id") @db.Uuid
  actorId        String?       @map("actor_id") @db.Uuid
  type           String        @db.VarChar(30)
  boardPostId    String?       @map("board_post_id") @db.Uuid
  boardCommentId String?       @map("board_comment_id") @db.Uuid
  titleId        String?       @map("title_id") @db.Uuid
  readAt         DateTime?     @map("read_at") @db.Timestamptz(3)
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  recipient      User          @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Restrict)
  actor          User?         @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Restrict)
  boardPost      BoardPost?    @relation(fields: [boardPostId], references: [id], onDelete: Restrict)
  boardComment   BoardComment? @relation(fields: [boardCommentId], references: [id], onDelete: Restrict)
  title          Title?        @relation(fields: [titleId], references: [id], onDelete: Restrict)

  @@unique([recipientId, type, boardCommentId], map: "notifications_recipient_type_comment_key")
  @@unique([recipientId, type, boardPostId], map: "notifications_recipient_type_post_key")
  @@unique([recipientId, type, titleId], map: "notifications_recipient_type_title_key")
  @@index([actorId], map: "idx_notifications_actor_id")
  @@index([boardPostId], map: "idx_notifications_board_post_id")
  @@index([boardCommentId], map: "idx_notifications_board_comment_id")
  @@index([titleId], map: "idx_notifications_title_id")
  @@index([recipientId, createdAt(sort: Desc), id(sort: Desc)], map: "idx_notifications_recipient_created")
  @@map("notifications")
}
```

`User` に `receivedNotifications Notification[] @relation("NotificationRecipient")` と `actedNotifications Notification[] @relation("NotificationActor")`、`BoardPost`、`BoardComment`、`Title` に `notifications Notification[]` を追加する。部分索引とチェック制約はSQLを正本とする。

- [ ] **Step 6: 通知型、表示文、対象URL、カーソルを最小実装する。**

```ts
export type NotificationType = "board_reply" | "board_pinned" | "title_unlocked";

export type NotificationView = {
  id: string;
  type: NotificationType;
  actorName: string | null;
  message: string;
  postId: string | null;
  readAt: string | null;
  createdAt: string;
  targetAvailable: boolean;
};

export function notificationMessage(value: { type: NotificationType; actorName: string | null }) {
  if (value.type === "board_reply") return `${value.actorName ?? "ユーザー"}さんが投稿に返信しました`;
  if (value.type === "board_pinned") return "管理者から新しいお知らせがあります";
  return "新しい称号を獲得しました";
}

export function notificationTarget(value: { type: NotificationType; postId: string | null }) {
  if (value.type === "board_reply" || value.type === "board_pinned") {
    return value.postId ? `/board/posts/${value.postId}` : null;
  }
  return "/titles";
}
```

- [ ] **Step 7: ローカル検証を実行する。**

Run: `node --test tests/notifications-schema.test.mjs tests/notifications-contract.test.mjs`

Run: `npx prisma validate`

Run: `npx prisma generate`

Run: `npm run typecheck`

Expected: すべて終了コード0。

- [ ] **Step 8: Task 1だけをコミットする。**

```bash
git add supabase/migrations/20260924000000_add_notifications.sql prisma/schema.prisma prisma/generated src/lib/notifications/contract.ts src/lib/notifications/cursor.ts tests/notifications-schema.test.mjs tests/notifications-contract.test.mjs
git commit -m "feat: add notification schema and contracts"
```

### Task 2: Supabaseマイグレーション適用ゲート

**Files:**
- Verify: `supabase/migrations/20260924000000_add_notifications.sql`

**Interfaces:**
- Consumes: Task 1のSQL
- Produces: 実DBの `public.notifications` とPrismaが期待する制約・索引

- [ ] **Step 1: MCPで接続先、既存テーブル、適用履歴を読み取り確認する。**

Expected: `users`、`board_posts`、`board_comments`、既存マイグレーションが残り、`notifications` は未適用。

- [ ] **Step 2: SQL安全性を再検査する。**

Run: `node --test tests/notifications-schema.test.mjs`

Expected: PASSし、破壊的SQLが検出されない。

- [ ] **Step 3: 接続先プロジェクト名、作成テーブル、SQL全文をユーザーへ提示して停止する。**

Expected: ユーザーが実DB適用を明示承認するまで、マイグレーションを適用しない。

- [ ] **Step 4: 承認後、保存済みSQLと同一内容を追跡可能なSupabaseマイグレーションとして1回だけ適用する。**

Expected: `notifications` だけが追加される。

- [ ] **Step 5: 適用後を読み取り確認する。**

Expected: 通知テーブル、外部キー、3つの一意制約、一覧索引、未読部分索引、RLSが存在し、既存テーブル・データ・マイグレーション履歴が維持される。

### Task 3: 教師ID、役割ガード、開発用教師ログイン

**Files:**
- Create: `src/lib/teacher/identity.ts`
- Create: `src/lib/teacher/auth.ts`
- Create: `src/app/api/dev/test-teacher-login/route.ts`
- Create: `scripts/provision-teacher.mjs`
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/me/route.ts`
- Create: `tests/teacher-auth-rules.test.mjs`

**Interfaces:**
- Produces: `TEACHER_DISPLAY_NAME`, `displayNameForRole(roleName, storedName)`, `isTeacherRole(roleName)`, `isTeacherSessionPayload(value)`
- Produces: `requireTeacherPageUser()`, `getTeacherApiUser()`
- Produces: 開発用 `POST /api/dev/test-teacher-login`

- [ ] **Step 1: 教師固定名と開発アカウント検査の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayNameForRole,
  isTeacherRole,
  isTeacherSessionPayload,
  normalizeDevTeacherAccount,
} from "../src/lib/teacher/identity.ts";

test("teacher identity is fixed and student identity is preserved", () => {
  assert.equal(displayNameForRole("teacher", "別名"), "管理者");
  assert.equal(displayNameForRole("student", "あおい"), "あおい");
  assert.equal(isTeacherRole("teacher"), true);
  assert.equal(isTeacherRole("student"), false);
});

test("development teacher accepts only test-teacher", () => {
  assert.equal(normalizeDevTeacherAccount(" TEST-TEACHER "), "test-teacher@test.local");
  assert.equal(normalizeDevTeacherAccount("test-student"), null);
  assert.equal(normalizeDevTeacherAccount("teacher@example.com"), null);
});

test("teacher session payload rejects authenticated non-teachers", () => {
  assert.equal(isTeacherSessionPayload({ role: "teacher", displayName: "管理者" }), true);
  assert.equal(isTeacherSessionPayload({ role: "student", displayName: "あおい" }), false);
  assert.equal(isTeacherSessionPayload({ error: "unauthorized" }), false);
});
```

- [ ] **Step 2: テストが未定義で失敗することを確認する。**

Run: `node --test tests/teacher-auth-rules.test.mjs`

Expected: `identity.ts` が存在しないためFAIL。

- [ ] **Step 3: 教師ID関数とサーバーガードを実装する。**

```ts
export const TEACHER_DISPLAY_NAME = "管理者";

export function isTeacherRole(roleName: string) {
  return roleName === "teacher";
}

export function displayNameForRole(roleName: string, storedName: string) {
  return isTeacherRole(roleName) ? TEACHER_DISPLAY_NAME : storedName;
}

export function normalizeDevTeacherAccount(account: string) {
  return account.trim().toLowerCase() === "test-teacher"
    ? "test-teacher@test.local"
    : null;
}

export function isTeacherSessionPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).role === "teacher";
}
```

`requireTeacherPageUser()` は `getCurrentUser()` がnullなら `/login/teacher`、非教師なら `/` へ `redirect()` する。`getTeacherApiUser()` は教師だけを返し、それ以外はnullを返す。

- [ ] **Step 4: `getCurrentUser()` と `ensureAppUser()` が教師プロフィールを保持するよう更新する。**

すべてのユーザー取得に `teacherProfile: true` を追加する。既存ユーザーが教師で `teacherProfile` を持たない場合だけ、同じトランザクションで空の教師プロフィールを作る。教師の `displayName` はレスポンス整形時に `管理者` とするが、学生のGoogle表示名は変更しない。

- [ ] **Step 5: 開発用教師ログインを実装する。**

`NODE_ENV === "production"` では404。`test-teacher` 以外は400。`teacher` ロールを取得し、メール `test-teacher@test.local`、固定名 `管理者`、active状態で `users` と `teacher_profiles` をトランザクション内upsertする。既存メールが学生ロールなら409。成功時は既存の `DEV_AUTH_COOKIE` を8時間設定し `{ next: "/teacher" }` を返す。

- [ ] **Step 6: 本番アプリ側教師を準備する管理スクリプトを作る。**

`scripts/provision-teacher.mjs` は `.env` と `.env.local` を明示的にUTF-8で読み、`DIRECT_URL` と `TEACHER_ACCOUNT_EMAIL` を必須とする。トランザクション内で `teacher` ロールを取得し、対象メールのユーザーを `管理者`・active・teacherロールとしてupsertし、`teacher_profiles` をupsertする。パスワードやSupabase Authユーザーは作成しない。対象メール、接続ホスト、変更予定を表示して `--apply` がない場合はロールバックする。

- [ ] **Step 7: 認証規則と既存テストを実行する。**

Run: `node --test tests/teacher-auth-rules.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: すべて成功。`/api/me` は教師に `{ role: "teacher", displayName: "管理者", profile: null }` を返す。

- [ ] **Step 8: Task 3をコミットする。**

```bash
git add src/lib/teacher src/lib/auth.ts src/app/api/me/route.ts src/app/api/dev/test-teacher-login/route.ts scripts/provision-teacher.mjs tests/teacher-auth-rules.test.mjs
git commit -m "feat: add teacher identity and authentication guards"
```

### Task 4: 学生・教師ログイン画面の正式実装

**Files:**
- Create: `public/brand-login.svg`
- Create: `src/components/login-layout.tsx`
- Create: `src/components/teacher-login-form.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/teacher/page.tsx`
- Remove exports no longer used from: `src/components/login-screen.tsx`
- Create: `tests/login-layout.test.mjs`

**Interfaces:**
- Consumes: Task 3の開発用教師APIと `/api/me`
- Produces: `LoginLayout({ audience, children })`、`TeacherLoginForm`

- [ ] **Step 1: 確定デザインの失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("login layout keeps the approved 3:7 split without mascot", () => {
  const layout = readFileSync("src/components/login-layout.tsx", "utf8");
  const logo = readFileSync("public/brand-login.svg", "utf8");
  assert.match(layout, /lg:grid-cols-\[3fr_7fr\]/);
  assert.match(layout, /brand-login\.svg/);
  assert.doesNotMatch(layout + logo, /mascot|キャラクター|管理者専用/i);
});

test("teacher form has aligned fields button and switch link", () => {
  const form = readFileSync("src/components/teacher-login-form.tsx", "utf8");
  assert.match(form, /max-w-\[430px\]/);
  assert.match(form, /学生ログインへ戻る/);
  assert.match(form, /signInWithPassword/);
  assert.match(form, /test-teacher-login/);
});
```

- [ ] **Step 2: 未作成ファイルでFAILすることを確認する。**

Run: `node --test tests/login-layout.test.mjs`

Expected: `login-layout.tsx` が存在しないためFAIL。

- [ ] **Step 3: 共通ログイン枠と画像ロゴを実装する。**

`LoginLayout` は `lg:grid-cols-[3fr_7fr]`、濃紺の左領域、白い右領域を持つ。画像ロゴはトロフィー、二段のアプリ名、試験名だけで、人物やキャラクターを含めない。モバイルは1列へ切り替える。

- [ ] **Step 4: 教師ログイン動作を実装する。**

開発環境でアカウントが `test-teacher` の場合は開発APIを呼ぶ。それ以外はブラウザーSupabase Clientの `auth.signInWithPassword({ email, password })` を呼び、成功後 `/api/me` を取得してTask 3の `isTeacherSessionPayload()` で判定する。教師でなければ `auth.signOut()` して「教師アカウントではありません。」を表示する。教師なら `router.replace("/teacher")` と `router.refresh()` を行う。失敗中も入力値を保持し、ボタンを二重送信不可にする。

- [ ] **Step 5: 学生ログインを同じ枠へ移す。**

既存 `GoogleLoginButton` と安全な `next` 解釈を維持する。左側コピーだけを学生用へ切り替え、切替リンクを教師フォームと同じ左端へ置く。

- [ ] **Step 6: テストと静的検証を実行する。**

Run: `node --test tests/login-layout.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。教師パスワードはログ、URL、React state以外の永続領域へ出ない。

- [ ] **Step 7: Task 4をコミットする。**

```bash
git add public/brand-login.svg src/components/login-layout.tsx src/components/teacher-login-form.tsx src/components/login-screen.tsx src/app/login/page.tsx src/app/login/teacher/page.tsx tests/login-layout.test.mjs
git commit -m "feat: redesign student and teacher login"
```

### Task 5: 教師シェルと役割別ページ境界

**Files:**
- Create: `src/components/teacher-shell.tsx`
- Create: `src/components/notification-bell.tsx`
- Create: `src/components/role-shell.tsx`
- Modify: `src/components/student-shell.tsx`
- Split: `src/app/page.tsx` into `src/app/page.tsx` and `src/app/student-home.tsx`
- Create: `tests/teacher-shell.test.mjs`

**Interfaces:**
- Consumes: Task 3の教師役割ガード
- Produces: `TeacherShell({ children })`、`RoleShell({ roleName, ... })`、`NotificationBell`

- [ ] **Step 1: 教師メニューと役割境界の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("teacher shell exposes only approved navigation", () => {
  const source = readFileSync("src/components/teacher-shell.tsx", "utf8");
  for (const text of ["教師ホーム", "学習状況", "掲示板", "通知", "ログアウト", "管理者"]) {
    assert.match(source, new RegExp(text));
  }
  assert.doesNotMatch(source, /マイページ|称号ショップ|ランキング/);
});

test("student home redirects teachers before rendering student APIs", () => {
  const source = readFileSync("src/app/page.tsx", "utf8");
  assert.match(source, /getCurrentUser/);
  assert.match(source, /role\.name === "teacher"/);
  assert.match(source, /redirect\("\/teacher"\)/);
});
```

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/teacher-shell.test.mjs`

Expected: 教師シェル未作成でFAIL。

- [ ] **Step 3: 教師シェルと共通ベルの枠を実装する。**

教師シェルは既存の濃紺、青アクセント、モバイルサイドバー挙動を踏襲する。右上の教師名は紫系の太字と円形「管」アバターを使う。`NotificationBell` はこの段階では `/notifications` へのリンクと読み込み中の空バッジを提供し、Task 8で未読APIへ接続する。

- [ ] **Step 4: 学生シェルの固定サンプル通知を削除する。**

静的 `notifications` 配列とドロップダウンを削除し、教師と同じ `NotificationBell` を使う。サイドバー項目は変更しない。

- [ ] **Step 5: 学生ホームをServer Componentで役割ガードする。**

既存のClient Component本文を `student-home.tsx` へ移す。新しい `page.tsx` は `getCurrentUser()` を呼び、未ログインなら `/login`、教師なら `/teacher` へredirectし、学生だけに `<StudentHome />` を返す。

- [ ] **Step 6: テストを実行する。**

Run: `node --test tests/teacher-shell.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。学生・教師のナビゲーション項目が混在しない。

- [ ] **Step 7: Task 5をコミットする。**

```bash
git add src/components/teacher-shell.tsx src/components/notification-bell.tsx src/components/role-shell.tsx src/components/student-shell.tsx src/app/page.tsx src/app/student-home.tsx tests/teacher-shell.test.mjs
git commit -m "feat: add teacher shell and role boundaries"
```

### Task 6: 教師ホームと学生一覧集計

**Files:**
- Create: `src/lib/teacher/dashboard.ts`
- Create: `src/lib/teacher/students.ts`
- Create: `src/app/teacher/page.tsx`
- Create: `src/app/teacher/students/page.tsx`
- Create: `src/app/teacher/students/student-list.tsx`
- Modify: `src/lib/tokyo-date.ts`
- Create: `tests/teacher-learning-rules.test.mjs`

**Interfaces:**
- Produces: `getTeacherDashboardData(): Promise<TeacherDashboardData>`
- Produces: `listStudentLearningSummaries(page: number): Promise<StudentLearningPage>`
- Produces: `calculateAccuracy(correct, answers)`、`latestLearningAt(daily, practice)`

- [ ] **Step 1: 集計境界の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccuracy,
  latestLearningAt,
  normalizeStudentPage,
} from "../src/lib/teacher/students.ts";

test("teacher learning summary handles empty and mixed activity", () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(7, 9), 78);
  assert.equal(latestLearningAt(null, null), null);
  assert.equal(
    latestLearningAt("2026-09-20T00:00:00.000Z", "2026-09-21T00:00:00.000Z"),
    "2026-09-21T00:00:00.000Z",
  );
  assert.equal(normalizeStudentPage("0"), 1);
  assert.equal(normalizeStudentPage("3"), 3);
});
```

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/teacher-learning-rules.test.mjs`

Expected: `students.ts` 未作成でFAIL。

- [ ] **Step 3: 純粋関数とAsia/Tokyoの週境界を実装する。**

`getTokyoWeekRange()` は現在の東京日付を基準に月曜00:00から次の月曜00:00を返す。正答率は回答0件なら0、他は整数へ丸める。

- [ ] **Step 4: 教師ダッシュボード集計を実装する。**

`getTeacherDashboardData()` は次を並列取得する。

- activeかつ未削除のstudentロール人数
- 当月の `daily_qa_answers.user_id` と完了済み `practice_sessions.user_id` のdistinct集合サイズ
- 今週の一日一問回答数と過去問回答数の合計
- `is_pinned = true`、未削除、教師作成の投稿数
- `listStudentLearningSummaries(1)` の先頭4人

- [ ] **Step 5: 学生一覧を1回の集計SQLと件数取得で実装する。**

ページサイズ20。active・未削除・studentロールだけを対象に、一日一問と完了済み過去問をuser単位で集計し、最終学習日時の降順・未学習は最後・user idで安定ソートする。回答数と正解数は両方の合計を使う。クエリ値は `Prisma.sql` のパラメータとして渡す。

- [ ] **Step 6: 教師ホームと一覧A案を実装する。**

`/teacher` は2つのヒーローボタンと学生最新状況を表示する。独立した「掲示板に投稿」「未読通知」クイックカードは作らない。`/teacher/students` は表示名、最終学習、回答数、正解数、正答率を表とモバイルカードで表示し、表示名を詳細リンクにする。

- [ ] **Step 7: 検証する。**

Run: `node --test tests/teacher-learning-rules.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。空DBでも0件表示になり、0除算が発生しない。

- [ ] **Step 8: Task 6をコミットする。**

```bash
git add src/lib/teacher/dashboard.ts src/lib/teacher/students.ts src/lib/tokyo-date.ts src/app/teacher/page.tsx src/app/teacher/students/page.tsx src/app/teacher/students/student-list.tsx tests/teacher-learning-rules.test.mjs
git commit -m "feat: add teacher dashboard and student list"
```

### Task 7: 学生別学習状況詳細

**Files:**
- Create: `src/lib/teacher/student-detail.ts`
- Create: `src/app/teacher/students/[userId]/page.tsx`
- Create: `src/app/teacher/students/[userId]/student-learning-detail.tsx`
- Create: `tests/teacher-student-detail.test.mjs`

**Interfaces:**
- Produces: `parseTeacherStudentDetailQuery(params)`
- Produces: `getTeacherStudentDetail(userId, { tab, page })`

- [ ] **Step 1: タブ、ページ、UUID検査の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStudentId,
  parseTeacherStudentDetailQuery,
} from "../src/lib/teacher/student-detail.ts";

test("student detail query accepts only two tabs and positive pages", () => {
  assert.deepEqual(parseTeacherStudentDetailQuery({ tab: "daily", page: "2" }), { tab: "daily", page: 2 });
  assert.deepEqual(parseTeacherStudentDetailQuery({ tab: "unknown", page: "-1" }), { tab: "practice", page: 1 });
  assert.equal(isStudentId("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isStudentId("not-a-uuid"), false);
});
```

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/teacher-student-detail.test.mjs`

Expected: モジュール未作成でFAIL。

- [ ] **Step 3: 学生詳細サービスを実装する。**

対象がactive・未削除・studentロールでなければnullを返す。基本情報と総回答・総正解・正答率を取得し、選択タブだけを20件ずつ読む。

- 過去問: `practice_sessions` のcompletedのみ。試験名、完了日時、回答数、正解数、正答率、獲得ポイント。
- 一日一問: `daily_qa_answers`。回答日、問題のsource情報と本文、選択肢、正誤。

- [ ] **Step 4: 詳細画面を実装する。**

教師ガード後にUUIDと学生存在を確認し、無効なら `notFound()`。基本情報、集計カード、「過去問練習」「一日一問」のURL同期タブ、ページ送りを表示する。編集ボタン、ポイント変更、名前変更を置かない。

- [ ] **Step 5: 検証する。**

Run: `node --test tests/teacher-student-detail.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。不正UUID、教師ID、削除済み学生は404。

- [ ] **Step 6: Task 7をコミットする。**

```bash
git add src/lib/teacher/student-detail.ts src/app/teacher/students/[userId] tests/teacher-student-detail.test.mjs
git commit -m "feat: add teacher student learning detail"
```

### Task 8: 通知読み取り、個別既読、ベル、一覧B案

**Files:**
- Create: `src/lib/notifications/read.ts`
- Create: `src/lib/notifications/write.ts`
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/unread-count/route.ts`
- Create: `src/app/api/notifications/[notificationId]/read/route.ts`
- Create: `src/app/notifications/page.tsx`
- Create: `src/app/notifications/notification-list.tsx`
- Modify: `src/components/notification-bell.tsx`
- Create: `tests/notification-read-rules.test.mjs`

**Interfaces:**
- Produces: `listNotifications(recipientId, cursor)`、`getUnreadNotificationCount(recipientId)`
- Produces: `markNotificationRead(recipientId, notificationId): Promise<"changed" | "not_found">`

- [ ] **Step 1: 個別既読の所有者ルールを失敗テストで固定する。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationReadWhere } from "../src/lib/notifications/write.ts";

test("read update is always scoped to notification recipient", () => {
  assert.deepEqual(
    notificationReadWhere("user-a", "00000000-0000-4000-8000-000000000001"),
    {
      id: "00000000-0000-4000-8000-000000000001",
      recipientId: "user-a",
    },
  );
});
```

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/notification-read-rules.test.mjs`

Expected: `write.ts` 未作成でFAIL。

- [ ] **Step 3: 一覧、未読件数、個別既読サービスを実装する。**

一覧は本人の通知だけを `createdAt desc, id desc` で21件取得し、20件と次カーソルを返す。返信は `boardComment.post` から投稿IDと削除状態を、固定は `boardPost` から取得する。actorが教師なら表示名を `管理者` に変換する。対象投稿が削除済みなら `postId: null`、`targetAvailable: false` とする。既読更新は `where: { id, recipientId }` の `updateMany` を使い、他人の通知は404へ変換する。

- [ ] **Step 4: 3つのAPIを実装する。**

各Route Handlerは `getCurrentUser()` を使い、未ログイン401、カーソル・UUID不正400、他人または不存在の通知404を返す。個別既読は既読済み再実行も200にするため、先に本人通知の存在を確認してから `readAt` がnullの行だけ更新する。

- [ ] **Step 5: 通知一覧B案を実装する。**

新しい順の1列一覧、未読3件などの件数表示、淡い青の未読行、未読ドット、日時、本文を表示する。返信「返」アイコン、一括既読ボタン、種別タブは置かない。行を押したらPATCH成功後に投稿へ移動する。対象削除済みはPATCH後も画面に残し、「対象の投稿は削除されています。」を表示する。

- [ ] **Step 6: 共通ベルを未読APIへ接続する。**

`NotificationBell` はmount時とpathname変更時に未読件数を取得する。0件はバッジなし、1〜99は数値、100以上は `99+`。リンク先は `/notifications` で、ドロップダウンは作らない。

- [ ] **Step 7: Review Focusの所有者・削除済みテストを追加する。**

`notification-read-rules.test.mjs` に、別recipientの条件が作れないこと、`notificationTarget` が `postId: null` をnullへ変換すること、既読済みの再操作が成功扱いとなるサービス結果変換を追加する。

- [ ] **Step 8: 検証する。**

Run: `node --test tests/notification-read-rules.test.mjs tests/notifications-contract.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。通知レスポンスに他人のメール、ポイント、学生番号を含めない。

- [ ] **Step 9: Task 8をコミットする。**

```bash
git add src/lib/notifications src/app/api/notifications src/app/notifications src/components/notification-bell.tsx tests/notification-read-rules.test.mjs tests/notifications-contract.test.mjs
git commit -m "feat: add notification inbox and unread badge"
```

### Task 9: 掲示板返信・ピンと通知発行の原子化

**Files:**
- Modify: `src/lib/notifications/write.ts`
- Modify: `src/lib/board/write-comments.ts`
- Modify: `src/lib/board/write-posts.ts`
- Modify: `tests/board-comment-rules.test.mjs`
- Modify: `tests/board-post-rules.test.mjs`
- Create: `tests/notification-emission-rules.test.mjs`

**Interfaces:**
- Produces: `createBoardReplyNotification(tx, value)`
- Produces: `createBoardPinnedNotifications(tx, value)`
- Changes: `createBoardComment()` と `setBoardPostPin()` が通知まで同一トランザクションで完了する

- [ ] **Step 1: 自己返信と固定再配信の失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldNotifyBoardReply,
  shouldBroadcastPinnedPost,
} from "../src/lib/notifications/write.ts";

test("reply notifications skip self replies", () => {
  assert.equal(shouldNotifyBoardReply("author", "author"), false);
  assert.equal(shouldNotifyBoardReply("author", "other"), true);
});

test("pin notifications emit only on the first false to true transition", () => {
  assert.equal(shouldBroadcastPinnedPost(false, true), true);
  assert.equal(shouldBroadcastPinnedPost(true, true), false);
  assert.equal(shouldBroadcastPinnedPost(true, false), false);
});
```

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/notification-emission-rules.test.mjs`

Expected: 2関数未定義でFAIL。

- [ ] **Step 3: 返信作成と通知を同一トランザクションへ統合する。**

投稿取得で `authorId` と投稿者のactive・deleted状態も読む。返信作成後、返信者と投稿者が異なり投稿者がactiveなら、`recipientId = post.authorId`、`actorId = actor.id`、`type = board_reply`、`boardCommentId = created.id` で通知を作る。一意制約違反は `createMany({ skipDuplicates: true })` で吸収する。トランザクション外のauthor取得は既存どおり表示値生成だけに限定する。

- [ ] **Step 4: ピン更新と一括通知を同一トランザクションへ統合する。**

対象投稿の現在の `isPinned` を読み、権限確認後に条件付き更新する。`false -> true` の場合だけactive・未削除・studentロールのIDを取得し、`recipientId`、教師actor、`boardPostId` を `createMany({ skipDuplicates: true })` で挿入する。解除、既に固定済み、再固定では一意制約により追加されない。並行更新でも同じ投稿・学生の通知は1行だけになる。

- [ ] **Step 5: Review Focusのテストを完成させる。**

純粋関数テストに加え、Prisma呼び出し境界を依存注入できる通知発行関数へ分離し、次をNode標準テストで検証する。

- 自己返信はinsert 0件
- 他人の返信はrecipientが投稿者、actorが返信者
- inactive投稿者はinsert 0件
- 固定済みからtrueは学生一覧を読まない
- falseからtrueはstudentだけを一括挿入し `skipDuplicates: true`

- [ ] **Step 6: 掲示板回帰テストを実行する。**

Run: `node --test tests/notification-emission-rules.test.mjs tests/board-comment-rules.test.mjs tests/board-post-rules.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: 成功。通知作成失敗時は返信・ピンもロールバックする。

- [ ] **Step 7: Task 9をコミットする。**

```bash
git add src/lib/notifications/write.ts src/lib/board/write-comments.ts src/lib/board/write-posts.ts tests/notification-emission-rules.test.mjs tests/board-comment-rules.test.mjs tests/board-post-rules.test.mjs
git commit -m "feat: emit notifications from board activity"
```

### Task 10: 掲示板の教師シェル・固定名・全体検証

**Files:**
- Modify: `src/lib/board/contract.ts`
- Modify: `src/app/board/page.tsx`
- Modify: `src/app/board/posts/[postId]/page.tsx`
- Modify: `src/app/board/users/[userId]/page.tsx`
- Modify: `src/app/board/post-card.tsx`
- Modify: `tests/board-public-data.test.mjs`
- Create: `tests/role-shell-routing.test.mjs`
- Modify: `docs/superpowers/plans/2026-09-24-teacher-portal-notifications-login-implementation.md` のチェック欄

**Interfaces:**
- Consumes: Task 5の `RoleShell`、Task 3の固定教師名
- Produces: 学生・教師で共有される掲示板画面と、特別表示の `管理者`

- [ ] **Step 1: 教師固定名と役割別シェルの失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toBoardAuthor } from "../src/lib/board/contract.ts";

test("board always exposes the fixed teacher name", () => {
  const result = toBoardAuthor({
    id: "teacher",
    displayName: "保存された別名",
    role: { name: "teacher" },
    studentProfile: null,
    teacherProfile: { avatarUrl: null },
  });
  assert.equal(result.displayName, "管理者");
  assert.equal(result.isTeacher, true);
  assert.equal(result.titleName, null);
});
```

`role-shell-routing.test.mjs` は掲示板3ページが `RoleShell` と `user.role.name` を渡し、直接 `StudentShell` だけで包まないことをソース検査する。

- [ ] **Step 2: FAILを確認する。**

Run: `node --test tests/board-public-data.test.mjs tests/role-shell-routing.test.mjs`

Expected: 教師名が保存名のまま、掲示板がStudentShell固定のためFAIL。

- [ ] **Step 3: 掲示板公開著者の教師名を固定する。**

`toBoardAuthor()` は教師なら `displayName: TEACHER_DISPLAY_NAME`、称号null、教師プロフィールのavatarだけを使う。学生は既存表示を維持する。

- [ ] **Step 4: 掲示板3ページをRoleShellへ切り替える。**

一覧、投稿詳細、公開プロフィールで `roleName` を渡す。教師はTeacherShell、学生はStudentShellとなる。URL、データ取得、投稿・返信・いいね操作は共有のままとする。

- [ ] **Step 5: 教師名を特別表示する。**

投稿と返信の教師名は紫系の太字、教師バッジを付ける。固定教師投稿には既存の「先生からのお知らせ」を維持する。教師に称号や自己紹介を追加しない。

- [ ] **Step 6: 自動検証をすべて実行する。**

Run: `node --test`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run build`

Run: `git diff --check`

Expected: すべて終了コード0。

- [ ] **Step 7: ローカルの役割別操作を確認する。**

開発サーバーで次を順に確認する。

1. `test-student` で学生ログインし、学生ホームと学生シェルを表示
2. `test-teacher` で教師ログインし、`/teacher`、学生一覧、学生詳細を表示
3. 教師通常投稿が固定されていないことを確認
4. 教師がピンし、固定表示と学生通知1件を確認
5. 解除・再固定して通知が増えないことを確認
6. 学生が投稿し、教師が返信して学生へ返信通知1件を確認
7. 投稿者の自己返信で通知が増えないことを確認
8. 通知を1件ずつ押し、既読化と投稿詳細への移動を確認
9. 「返」アイコンと一括既読ボタンがないことを確認
10. PC幅とスマートフォン幅でログイン、教師シェル、一覧、通知を確認

- [ ] **Step 8: 本番共有教師アカウント準備ゲートを実行する。**

Supabase Authに作成する共有メール、アプリ側upsert対象、接続先をユーザーへ提示し、明示承認後だけ `node scripts/provision-teacher.mjs --apply` を実行する。パスワードはユーザーがSupabase側で設定し、ターミナル出力やコミットに含めない。

- [ ] **Step 9: 既存DBと通知データを検証する。**

MCPの読み取りで、既存テーブル・既存データ・マイグレーション履歴が維持されていること、通知の重複制約が有効なことを確認する。ローカル確認で作成した投稿・通知を残した場合はIDと用途を報告し、勝手に物理削除しない。

- [ ] **Step 10: Task 10をコミットする。**

```bash
git add src/lib/board/contract.ts src/app/board src/app/board/post-card.tsx tests/board-public-data.test.mjs tests/role-shell-routing.test.mjs docs/superpowers/plans/2026-09-24-teacher-portal-notifications-login-implementation.md
git commit -m "feat: complete teacher portal and notifications"
```

## 完了条件

- 全10タスクのチェックが完了し、自動検証がすべて成功している。
- 教師と学生の役割境界、固定教師名、確定ログインデザインがブラウザーで確認済みである。
- 返信通知、固定通知、未読件数、個別既読が受入基準どおり動作する。
- 固定通知は解除・再固定・並行操作でも重複しない。
- Supabaseの既存DB、既存データ、既存マイグレーション履歴に削除・初期化がない。
- 実装差分、DB適用、共有教師アカウント準備、確認用データの有無を日本語で引き渡している。
