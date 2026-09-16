# 掲示板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学生・教師の通常投稿、返信、いいね、教師投稿の後からのピン固定、公開プロフィール、本人・教師削除を実装する。

**Architecture:** 4つの追加テーブルを追跡可能なSupabaseマイグレーションで作り、既存のUser・プロフィール・称号をPrismaで参照する。Next.jsのRoute Handlerは認証とHTTP変換を担い、DB読み書きは小さな掲示板サービスへ分離する。Server Componentが初回データを渡し、Client Componentが投稿・返信などの操作を担当する。

**Tech Stack:** Next.js 16.2.9、React 19.2.4、TypeScript、Tailwind CSS 4、Prisma 7.8.0、Supabase PostgreSQL、Node.js 24標準テスト。

**Spec:** `docs/superpowers/specs/2026-09-16-board-design.md`

## Global Constraints

- 学生・教師は投稿と返信ができる。新規投稿の `is_pinned` は必ず `false`。
- 教師だけが教師作成の未削除投稿を投稿後にピン・解除できる。学生投稿は固定できない。複数固定を許可し、「すべて」で固定を先頭に表示する。
- 投稿・返信は空白のみ不可、JavaScript文字列長で最大280文字。タイトル、カテゴリ、検索、ハッシュタグ、問題カード、通知、階層返信は追加しない。
- 投稿者の公開情報は表示名、アイコン、学生の `bio` と装備称号、未削除投稿だけ。教師の架空の `bio`・称号やメール・番号・成績を出さない。
- 投稿・返信は論理削除。教師削除は同じトランザクションで `board_delete_logs` に記録する。既存DB・既存データ・適用済みマイグレーションを削除または初期化しない。
- `DATABASE_URL` はアプリのTransaction mode、`DIRECT_URL` はPrisma CLI用。ライブDBへ `prisma db push`、`db reset`、`DROP`、`TRUNCATE` を実行しない。
- パッケージと `package.json` の依存関係は変更しない。既存テキストの文字コード・BOM・改行を維持し、新規リポジトリ文書はUTF-8・BOMなし・CRLFにする。
- DBマイグレーションの実適用前には、SQL全文・接続先・既存履歴を提示してユーザーの別途確認を得る。Git pushも別途確認を得る。

## ファイル境界

| ファイル | 責務 |
| --- | --- |
| `supabase/migrations/20260916000000_board_core.sql` | 4テーブル・外部キー・制約・索引・RLSを追加するSQLのみ |
| `prisma/schema.prisma`、`prisma/generated/` | Prismaの関係と生成Client |
| `src/lib/board/contract.ts`、`validation.ts`、`cursor.ts`、`permissions.ts` | JSONの公開型、入力検査、ページ境界、役割判定。DBへの依存なし |
| `src/lib/board/read.ts` | 一覧・投稿単体・公開プロフィールのPrisma読み取り、件数の一括取得 |
| `src/lib/board/write-posts.ts`、`write-comments.ts`、`write-likes.ts` | 投稿・ピン・削除、返信・削除、いいね・解除のDB操作 |
| `src/app/api/board/**/route.ts` | `getCurrentUser()`、入力検査、サービス呼出し、HTTPステータス |
| `src/app/board/page.tsx`、`board-feed.tsx`、`post-card.tsx`、`reply-dialog.tsx` | 一覧の初回描画、2タブ、投稿と操作、X風返信画面 |
| `src/app/board/posts/[postId]/**`、`src/app/board/users/[userId]/**` | 投稿単体と公開プロフィール |
| `tests/board-*.test.mjs` | Node 24の標準テスト。追加パッケージを使わない |

## Task 1: 追加DBスキーマとPrisma関係

**Files:** Create `supabase/migrations/20260916000000_board_core.sql`、`tests/board-schema.test.mjs`。Modify `prisma/schema.prisma`。Generate `prisma/generated/`。

**Interfaces:** Produces Prisma models `BoardPost`, `BoardComment`, `BoardPostLike`, `BoardDeleteLog`。後続サービスはそのモデルを参照する。

- [ ] **Step 1: 失敗するSQL安全性テストを書く。** `tests/board-schema.test.mjs` を作る。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("board migration adds only four tables and no destructive SQL", () => {
  const sql = readFileSync("supabase/migrations/20260916000000_board_core.sql", "utf8");
  for (const name of ["board_posts", "board_comments", "board_post_likes", "board_delete_logs"]) {
    assert.match(sql, new RegExp(`create table public\\.${name}\\b`, "i"));
  }
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|prisma\s+db\s+push)\b/i);
  assert.match(sql, /is_pinned boolean not null default false/i);
  assert.equal((sql.match(/enable row level security/gi) ?? []).length, 4);
});
```

- [ ] **Step 2: テストがSQL未作成で失敗することを確認する。** Run: `node --test tests/board-schema.test.mjs`。Expected: `ENOENT`。

- [ ] **Step 3: 次の追加SQLを作る。** 既存テーブルに対するALTERやデータ操作を含めない。

```sql
create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(body) <= 280 and char_length(regexp_replace(body, '[[:space:]]', '', 'g')) > 0),
  is_pinned boolean not null default false,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3)
);
create index idx_board_posts_author_id_fk on public.board_posts(author_id);
create index idx_board_posts_feed_live on public.board_posts(is_pinned desc, created_at desc, id desc) where deleted_at is null;
create index idx_board_posts_author_live on public.board_posts(author_id, created_at desc, id desc) where deleted_at is null;

create table public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete restrict,
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(body) <= 280 and char_length(regexp_replace(body, '[[:space:]]', '', 'g')) > 0),
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3)
);
create index idx_board_comments_post_id_fk on public.board_comments(post_id);
create index idx_board_comments_author_id_fk on public.board_comments(author_id);
create index idx_board_comments_thread_live on public.board_comments(post_id, created_at, id) where deleted_at is null;

create table public.board_post_likes (
  post_id uuid not null references public.board_posts(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz(3) not null default now(),
  primary key (post_id, user_id)
);
create index idx_board_post_likes_user_id on public.board_post_likes(user_id);

create table public.board_delete_logs (
  id uuid primary key default gen_random_uuid(),
  target_type varchar(20) not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  deleted_by uuid not null references public.users(id) on delete restrict,
  reason text,
  deleted_at timestamptz(3) not null default now()
);
create index idx_board_delete_logs_actor_time on public.board_delete_logs(deleted_by, deleted_at desc);
create index idx_board_delete_logs_target on public.board_delete_logs(target_type, target_id);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_post_likes enable row level security;
alter table public.board_delete_logs enable row level security;
```

- [ ] **Step 4: Prismaに4モデルとUserの逆方向関係を追加する。** `User` に `boardPosts`, `boardComments`, `boardPostLikes`, `boardDeleteLogs` の配列を追加し、以下のモデルを `schema.prisma` に加える。部分索引はSQLの正本にのみ置く。

```prisma
model BoardPost {
  id        String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  authorId  String          @map("author_id") @db.Uuid
  body      String
  isPinned  Boolean         @default(false) @map("is_pinned")
  createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime        @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt DateTime?       @map("deleted_at") @db.Timestamptz(3)
  author    User            @relation("BoardPostAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  comments  BoardComment[]
  likes     BoardPostLike[]
  @@index([authorId], map: "idx_board_posts_author_id_fk")
  @@map("board_posts")
}
model BoardComment {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  postId    String    @map("post_id") @db.Uuid
  authorId  String    @map("author_id") @db.Uuid
  body      String
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(3)
  post      BoardPost @relation(fields: [postId], references: [id], onDelete: Restrict)
  author    User      @relation("BoardCommentAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  @@index([postId], map: "idx_board_comments_post_id_fk")
  @@index([authorId], map: "idx_board_comments_author_id_fk")
  @@map("board_comments")
}
model BoardPostLike {
  postId    String    @map("post_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  post      BoardPost @relation(fields: [postId], references: [id], onDelete: Restrict)
  user      User      @relation("BoardPostLikeUser", fields: [userId], references: [id], onDelete: Restrict)
  @@id([postId, userId])
  @@index([userId], map: "idx_board_post_likes_user_id")
  @@map("board_post_likes")
}
model BoardDeleteLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  targetType  String   @map("target_type") @db.VarChar(20)
  targetId    String   @map("target_id") @db.Uuid
  deletedById String   @map("deleted_by") @db.Uuid
  reason      String?
  deletedAt   DateTime @default(now()) @map("deleted_at") @db.Timestamptz(3)
  deletedBy   User     @relation("BoardDeletionActor", fields: [deletedById], references: [id], onDelete: Restrict)
  @@index([deletedById, deletedAt(sort: Desc)], map: "idx_board_delete_logs_actor_time")
  @@index([targetType, targetId], map: "idx_board_delete_logs_target")
  @@map("board_delete_logs")
}
```

`User` に加える配列は `boardPosts BoardPost[] @relation("BoardPostAuthor")`、`boardComments BoardComment[] @relation("BoardCommentAuthor")`、`boardPostLikes BoardPostLike[] @relation("BoardPostLikeUser")`、`boardDeleteLogs BoardDeleteLog[] @relation("BoardDeletionActor")` の4つ。

- [ ] **Step 5: ローカル検証とコミット。** Run: `node --test tests/board-schema.test.mjs`、`npx prisma validate`、`npx prisma generate`、`npm run typecheck`、`git diff --check`。Expected: 全て成功。SQL、スキーマ、生成Client、テストだけをコミットする。

- [ ] **Step 6: ライブDB適用ゲート。** `mcp__supabase__list_tables` と `list_migrations` で現行22テーブルと既存履歴を再確認し、アプリ接続の `SELECT current_user` と既存テーブルのRLS設定を読み取りで確認する。SQL全文・接続先プロジェクト・作成4テーブルをユーザーに提示する。**別途明示承認を受けるまで `apply_migration` を呼ばない。** 承認後はSQLファイルと同一本文を `mcp__supabase__apply_migration({ name: "board_core_20260916", query: sql })` で1回だけ適用し、4テーブル・RLS・既存テーブル・既存履歴を読み取りで確認する。途中の差分や不一致があれば適用を止める。

## Task 2: 入力・権限・カーソルの純粋な契約

**Files:** Create `src/lib/board/contract.ts`、`validation.ts`、`permissions.ts`、`cursor.ts`、`tests/board-contract.test.mjs`。

**Interfaces:** `BoardActor = { id: string; roleName: "student" | "teacher" }`、`BoardScope = "all" | "mine"`、`BoardCursor = { isPinned?: boolean; createdAt: string; id: string }`。Export `toBoardActor(id: string, roleName: string): BoardActor | null`、`parseBoardBody(value: unknown): string | null`、`isUuid(value: unknown): value is string`、`canCreatePost(actor)`, `canPinPost(actor, authorRole)`, `canDeleteContent(actor, authorId)`、`encodeBoardCursor(scope, last)`、`decodeBoardCursor(scope, text)`。JSON型 `BoardPostView` は `id`, `body`, `isPinned`, `createdAt`, `author`, `commentCount`, `likeCount`, `likedByMe`, `canDelete`, `canPin` を持つ。`BoardCommentView` は `id`, `postId`, `body`, `createdAt`, `author`, `canDelete` を持ち、`BoardThreadView` は `post: BoardPostView` と `comments: BoardCommentView[]` を持つ。`BoardPublicProfileView` は `id`, `displayName`, `avatarUrl`, `bio`, `titleName`, `isTeacher`, `postCount`, `posts`, `nextCursor` だけを持つ。

- [ ] **Step 1: 入力・権限・カーソルの失敗テストを書く。**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoardBody } from "../src/lib/board/validation.ts";
import { toBoardActor, canCreatePost, canPinPost, canDeleteContent } from "../src/lib/board/permissions.ts";
import { encodeBoardCursor, decodeBoardCursor } from "../src/lib/board/cursor.ts";

test("body keeps newlines but rejects blank and 281 UTF-16 units", () => {
  assert.equal(parseBoardBody("  質問\nです  "), "質問\nです");
  assert.equal(parseBoardBody(" \n\t "), null);
  assert.equal(parseBoardBody("あ".repeat(280)), "あ".repeat(280));
  assert.equal(parseBoardBody("あ".repeat(281)), null);
});
test("teachers post normally and can pin teacher posts only", () => {
  const teacher = { id: "t", roleName: "teacher" };
  assert.deepEqual(toBoardActor("t", "teacher"), teacher);
  assert.equal(toBoardActor("x", "admin"), null);
  assert.equal(canCreatePost(teacher), true);
  assert.equal(canPinPost(teacher, "teacher"), true);
  assert.equal(canPinPost(teacher, "student"), false);
  assert.equal(canPinPost({ id: "s", roleName: "student" }, "teacher"), false);
  assert.equal(canDeleteContent(teacher, "other"), true);
  assert.equal(canDeleteContent({ id: "s", roleName: "student" }, "other"), false);
});
test("all cursor retains the pinned sort key", () => {
  const last = { isPinned: true, createdAt: "2026-09-16T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" };
  assert.deepEqual(decodeBoardCursor("all", encodeBoardCursor("all", last)), last);
});
```

- [ ] **Step 2: Run `node --test tests/board-contract.test.mjs`。** Expected: import失敗。

- [ ] **Step 3: 型と純粋関数を実装する。** `parseBoardBody` は `typeof value === "string"` と `value.length <= 280` を確認し、`trim()` 後の本文を返す。ピン権限は `actor.roleName === "teacher" && authorRole === "teacher"`。カーソルは `Buffer.from(JSON.stringify(last)).toString("base64url")` と逆変換で、日付・UUID・固定状態・scopeを検証し、不正値は `null` にする。`BoardPostView.author` は `{ id, displayName, avatarUrl, titleName, isTeacher }` の公開値だけにする。Node標準テストで`.ts`を直接読む純粋ファイルは実行時の拡張子なし相対importを避け、型は `import type` のみで共有する。

```ts
export function parseBoardBody(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 280) return null;
  const body = value.trim();
  return body.length > 0 ? body : null;
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
export function toBoardActor(id: string, roleName: string): BoardActor | null {
  return roleName === "student" || roleName === "teacher" ? { id, roleName } : null;
}
export function canCreatePost(actor: BoardActor): boolean {
  return actor.roleName === "student" || actor.roleName === "teacher";
}
export function canPinPost(actor: BoardActor, authorRole: string): boolean {
  return actor.roleName === "teacher" && authorRole === "teacher";
}
export function canDeleteContent(actor: BoardActor, authorId: string): boolean {
  return actor.id === authorId || actor.roleName === "teacher";
}
export function encodeBoardCursor(scope: BoardScope, last: BoardCursor): string {
  const value = scope === "all"
    ? { isPinned: last.isPinned, createdAt: last.createdAt, id: last.id }
    : { createdAt: last.createdAt, id: last.id };
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const CURSOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function decodeBoardCursor(scope: BoardScope, text: string): BoardCursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) ||
        typeof row.id !== "string" || !CURSOR_UUID_PATTERN.test(row.id)) return null;
    if (scope === "all" && typeof row.isPinned !== "boolean") return null;
    return scope === "all"
      ? { isPinned: row.isPinned as boolean, createdAt: row.createdAt, id: row.id }
      : { createdAt: row.createdAt, id: row.id };
  } catch { return null; }
}
```

- [ ] **Step 4: Run `node --test tests/board-contract.test.mjs`、`npm run typecheck`、`npm run lint`。** Expected: 成功。4ファイルとテストだけをコミットする。

## Task 3: 一覧・投稿単体・公開プロフィールの読み取り

**Files:** Create `src/lib/board/read.ts`、`tests/board-public-data.test.mjs`、`src/app/api/board/posts/route.ts` のGET、`src/app/api/board/posts/[postId]/route.ts` のGET、`src/app/api/board/users/[userId]/route.ts` のGET。

**Interfaces:** Export `listBoardPosts(viewerId: string, scope: BoardScope, cursor: string | null): Promise<{ posts: BoardPostView[]; nextCursor: string | null }>`、`getBoardThread(viewerId: string, postId: string)`、`getBoardPublicProfile(viewerId: string, userId: string, cursor: string | null)`。削除済み投稿・無効ユーザーは公開しない。各読み取りの冒頭で閲覧者の役割を1回取得し、`canDelete` と `canPin` を作る。投稿ごとの役割問い合わせはしない。

- [ ] **Step 1: 公開値だけを返す失敗テストを書く。** `src/lib/board/contract.ts` にDB行を公開値へ変換する `toBoardAuthor` を追加する前に、次を `tests/board-public-data.test.mjs` へ書く。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toBoardAuthor } from "../src/lib/board/contract.ts";

test("public author never includes email, points or student number", () => {
  const result = toBoardAuthor({ id: "u", displayName: "みさき", email: "private@example.com",
    role: { name: "student" }, studentProfile: { avatarUrl: null, bio: "学習中", studentNo: "S1", totalPoints: 99,
      currentTitle: { name: "コツコツ学習者" } }, teacherProfile: null });
  assert.deepEqual(result, { id: "u", displayName: "みさき", avatarUrl: null,
    titleName: "コツコツ学習者", isTeacher: false });
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});
```

- [ ] **Step 2: Run `node --test tests/board-public-data.test.mjs`。** Expected: `toBoardAuthor` exportなしで失敗。

- [ ] **Step 3: Prisma読み取りと公開値変換を実装する。** `findMany` は `deletedAt: null`、`take: 21`、`author.role`・必要最小限のプロフィール・`currentTitle.name` を一括取得する。「すべて」は `isPinned desc, createdAt desc, id desc`、他は `createdAt desc, id desc`。最後の行からカーソルを作り、返す投稿は20件。カーソル条件は固定中なら「同じ固定状態で古い日時または同日時の小さいID、または非固定」、非固定なら「非固定で古い日時または同日時の小さいID」。コメント件数は未削除行の `groupBy(postId)`、いいね件数は `groupBy(postId)`、本人いいねは `findMany({ where: { userId: viewerId, postId: { in: ids } } })` で投稿ごとの問い合わせを避ける。`cursorWhere` は下記の関数で作り、不正な非空カーソルは400へ変換する。

```ts
export function toBoardAuthor(row: PublicAuthorRow): BoardAuthorView {
  const isTeacher = row.role.name === "teacher";
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: isTeacher ? row.teacherProfile?.avatarUrl ?? null : row.studentProfile?.avatarUrl ?? null,
    titleName: isTeacher ? null : row.studentProfile?.currentTitle?.name ?? null,
    isTeacher,
  };
}
```

`PublicAuthorRow` は `id: string`, `displayName: string`, `role: { name: string }`, `studentProfile: { avatarUrl: string | null; currentTitle: { name: string } | null } | null`, `teacherProfile: { avatarUrl: string | null } | null`。`BoardAuthorView` は `{ id: string; displayName: string; avatarUrl: string | null; titleName: string | null; isTeacher: boolean }`。

```ts
import { Prisma } from "../../../../prisma/generated/client";
class InvalidBoardCursorError extends Error {}
function cursorWhereFor(scope: BoardScope, cursor: BoardCursor | null): Prisma.BoardPostWhereInput {
  if (!cursor) return {};
  const when = new Date(cursor.createdAt);
  const older = [
    { createdAt: { lt: when } },
    { createdAt: when, id: { lt: cursor.id } },
  ];
  if (scope === "mine") return { OR: older };
  if (cursor.isPinned) return { OR: [
    { isPinned: true, ...older[0] }, { isPinned: true, ...older[1] }, { isPinned: false },
  ] };
  return { isPinned: false, OR: older };
}
const parsedCursor = cursor ? decodeBoardCursor(scope, cursor) : null;
if (cursor && !parsedCursor) throw new InvalidBoardCursorError();
const cursorWhere = cursorWhereFor(scope, parsedCursor);
```

```ts
const rows = await prisma.boardPost.findMany({
  where: { deletedAt: null, ...(scope === "mine" ? { authorId: viewerId } : {}), ...cursorWhere },
  orderBy: scope === "all"
    ? [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }]
    : [{ createdAt: "desc" }, { id: "desc" }],
  take: 21,
  include: { author: { select: { id: true, displayName: true,
    role: { select: { name: true } },
    studentProfile: { select: { avatarUrl: true, currentTitle: { select: { name: true } } } },
    teacherProfile: { select: { avatarUrl: true } } } } },
});
```

投稿単体は未削除の投稿と未削除返信を古い順に取得する。公開プロフィールは `user.findUnique` で `id`, `displayName`, `status`, `deletedAt`, `role.name`, 学生の `avatarUrl`, `bio`, `currentTitle.name`、教師の `avatarUrl` だけを `select` し、投稿を `authorId` と `deletedAt: null` で別取得し、同じ条件の `count` を `postCount` とする。APIのGETは `getCurrentUser()` がなければ401、UUID・カーソルが不正なら400、対象なしなら404。Next.js 16では `RouteContext` の `params` を `await` する。

```ts
export async function GET(_request: Request, ctx: RouteContext<"/api/board/posts/[postId]">) {
  const viewer = await getCurrentUser();
  if (!viewer) return unauthorized();
  const { postId } = await ctx.params;
  if (!isUuid(postId)) return badRequest("投稿IDが正しくありません。");
  const thread = await getBoardThread(viewer.id, postId);
  return thread ? Response.json(thread) : notFound("投稿が見つかりません。");
}
```

- [ ] **Step 4: Run `node --test tests/board-public-data.test.mjs`、`npm run typecheck`、`npm run lint`。** Expected: 成功。ライブDB適用後、ログイン状態で一覧GET、削除済み/不正IDの404/400、プロフィールJSONに非公開項目がないことを確認してコミットする。

## Task 4: 通常投稿・後からのピン・投稿削除

**Files:** Create `src/lib/board/write-posts.ts`、`src/app/api/board/posts/[postId]/pin/route.ts`。Modify `src/app/api/board/posts/route.ts` にPOST、`src/app/api/board/posts/[postId]/route.ts` にDELETE。Test `tests/board-post-rules.test.mjs`。

**Interfaces:** Export `createBoardPost(actor: BoardActor, body: string): Promise<{ id: string; isPinned: boolean }>`、`setBoardPostPin(actor, postId, isPinned): Promise<"changed" | "not_found" | "forbidden">`、`deleteBoardPost(actor, postId, reason?: string): Promise<"changed" | "not_found" | "forbidden">`。Route Handlerが結果をHTTPへ変換する。

- [ ] **Step 1: 通常投稿・ピン権限・削除権限の失敗テストを書く。** 既存 `permissions.ts` に `canPinPost` と `canDeleteContent` があるので、サービス用の入力解釈を純粋関数 `parseCreatePostPayload`、`parsePinPayload` として `validation.ts` に追加する。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCreatePostPayload, parsePinPayload } from "../src/lib/board/validation.ts";

test("create never accepts an initial pin flag", () => {
  assert.deepEqual(parseCreatePostPayload({ body: "今日の学習" }), { body: "今日の学習" });
  assert.equal(parseCreatePostPayload({ body: "今日の学習", isPinned: true }), null);
  assert.deepEqual(parsePinPayload({ isPinned: true }), { isPinned: true });
  assert.equal(parsePinPayload({ isPinned: "true" }), null);
});
```

- [ ] **Step 2: Run `node --test tests/board-post-rules.test.mjs`。** Expected: 2関数が未定義で失敗。

- [ ] **Step 3: POSTとピン変更を実装する。** POSTは `actor.id` をauthorに使い、`isPinned` をDB入力に渡さない。ピン操作は教師で、対象が未削除かつ作者の `role.name === "teacher"` のときだけ `updateMany({ where: { id, deletedAt: null }, data: { isPinned } })` を行う。同じ固定状態の再操作も成功扱いにする。Route Handlerは`request.json()`失敗を400にする。

```ts
export function parseCreatePostPayload(value: unknown): { body: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(row, "isPinned")) return null;
  const body = parseBoardBody(row.body);
  return body === null ? null : { body };
}
export function parsePinPayload(value: unknown): { isPinned: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row.isPinned === "boolean" ? { isPinned: row.isPinned } : null;
}
const created = await prisma.boardPost.create({
  data: { authorId: actor.id, body },
  select: { id: true, isPinned: true },
});
// created.isPinned はDB default false。教師にも作成時のピン指定を許さない。
const post = await prisma.boardPost.findUnique({ where: { id: postId }, select: {
  deletedAt: true, author: { select: { role: { select: { name: true } } } },
} });
if (!post || post.deletedAt) return "not_found" as const;
if (!canPinPost(actor, post.author.role.name)) return "forbidden" as const;
const changed = await prisma.boardPost.updateMany({
  where: { id: postId, deletedAt: null }, data: { isPinned },
});
return changed.count === 1 ? "changed" as const : "not_found" as const;
```

- [ ] **Step 4: 投稿削除と教師履歴を1トランザクションにする。** 投稿を読み、`canDeleteContent` を検査する。次の条件付き更新の `count === 1` のときだけ教師ログを作る。更新 `count === 0` は404。理由は教師の任意文字列として200文字まで、学生からの理由指定は使わない。

```ts
return prisma.$transaction(async (tx) => {
  const post = await tx.boardPost.findUnique({ where: { id: postId }, select: { authorId: true, deletedAt: true } });
  if (!post || post.deletedAt) return "not_found" as const;
  if (!canDeleteContent(actor, post.authorId)) return "forbidden" as const;
  const changed = await tx.boardPost.updateMany({ where: { id: postId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (changed.count !== 1) return "not_found" as const;
  if (actor.roleName === "teacher") {
    await tx.boardDeleteLog.create({ data: { targetType: "post", targetId: postId, deletedById: actor.id, reason } });
  }
  return "changed" as const;
});
```

- [ ] **Step 5: Run `node --test tests/board-post-rules.test.mjs`、`npm run typecheck`、`npm run lint`。** Expected: 成功。学生POST、教師POST、学生ピン403、教師ピン、学生投稿への教師ピン403、本人・教師DELETEのHTTP結果を検証してコミットする。

## Task 5: 返信・返信削除・投稿いいね

**Files:** Create `src/lib/board/write-comments.ts`、`write-likes.ts`、`src/app/api/board/posts/[postId]/comments/route.ts`、`src/app/api/board/comments/[commentId]/route.ts`、`src/app/api/board/posts/[postId]/likes/route.ts`。Test `tests/board-comment-rules.test.mjs`。

**Interfaces:** Export `createBoardComment(actor, postId, body): Promise<BoardCommentView | "not_found">`、`deleteBoardComment(actor, commentId, reason?): Promise<"changed" | "not_found" | "forbidden">`、`likeBoardPost(actor, postId): Promise<"liked" | "not_found">`、`unlikeBoardPost(actor, postId): Promise<"unliked" | "not_found">`。コメント作成は既存・未削除投稿に限る。いいねの複合PKを使い1人1件。

- [ ] **Step 1: 削除済み投稿への操作を拒む失敗テストを書く。** `permissions.ts` に `canInteractWithPost(deletedAt: Date | null): boolean` を追加する前にテストを作る。

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoardBody, isUuid } from "../src/lib/board/validation.ts";
import { canInteractWithPost } from "../src/lib/board/permissions.ts";

test("reply shares the post body limit and requires a UUID target", () => {
  assert.equal(parseBoardBody("\n  お答えします  "), "お答えします");
  assert.equal(parseBoardBody("あ".repeat(281)), null);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(canInteractWithPost(null), true);
  assert.equal(canInteractWithPost(new Date()), false);
});
```

- [ ] **Step 2: Run `node --test tests/board-comment-rules.test.mjs`。** Expected: `canInteractWithPost` 未定義で失敗。

- [ ] **Step 3: 返信作成・削除を実装する。** `canInteractWithPost` は `deletedAt === null` を返す。作成前に未削除投稿をDBトランザクションで確認し、`authorId: actor.id` と `postId` のみで返信を作成する。削除は `deletedAt: null` の条件付き更新を使い、教師が削除した場合だけ `targetType: "comment"` のログを同一トランザクションで作る。削除済み返信の再削除は404。学生は本人以外の返信を削除できない。

```ts
export function canInteractWithPost(deletedAt: Date | null): boolean {
  return deletedAt === null;
}
return prisma.$transaction(async (tx) => {
  const comment = await tx.boardComment.findUnique({ where: { id: commentId }, select: {
    authorId: true, deletedAt: true, post: { select: { deletedAt: true } },
  } });
  if (!comment || comment.deletedAt || comment.post.deletedAt) return "not_found" as const;
  if (!canDeleteContent(actor, comment.authorId)) return "forbidden" as const;
  const changed = await tx.boardComment.updateMany({
    where: { id: commentId, deletedAt: null }, data: { deletedAt: new Date() },
  });
  if (changed.count !== 1) return "not_found" as const;
  if (actor.roleName === "teacher") {
    await tx.boardDeleteLog.create({ data: { targetType: "comment", targetId: commentId, deletedById: actor.id, reason } });
  }
  return "changed" as const;
});
```

- [ ] **Step 4: いいね・解除を実装する。** 未削除投稿を確認してから、複合PKで重複を抑える。`createMany({ skipDuplicates: true })` により再いいねも成功、`deleteMany` により再解除も成功。レスポンスのliked状態はtrue/falseとし、投稿単体と一覧の集計を再取得する。

```ts
await tx.boardPostLike.createMany({
  data: [{ postId, userId: actor.id }], skipDuplicates: true,
});
await tx.boardPostLike.deleteMany({ where: { postId, userId: actor.id } });
```

- [ ] **Step 5: Run `node --test tests/board-comment-rules.test.mjs`、`npm run typecheck`、`npm run lint`。** Expected: 成功。学生・教師返信、削除済み投稿への返信404、同一ユーザーの二重いいねで1件、再解除で0件、教師削除履歴を検証してコミットする。

## Task 6: 掲示板一覧とX風返信画面

**Files:** Create `src/app/board/page.tsx`、`board-feed.tsx`、`post-card.tsx`、`reply-dialog.tsx`。既存 `StudentShell` の掲示板リンクは既にあるため変更しない。

**Interfaces:** `BoardFeed({ initialPosts, initialNextCursor, viewer })`、`PostCard({ post, onLike, onReply, onPin, onDelete })`、`ReplyDialog({ post, onClose, onSent })`。`BoardPostView` はTask 2の公開契約。操作後は対象を更新し、ピン時は一覧を再取得する。

- [ ] **Step 1: 画面の失敗基準を記録する。** 開発サーバーでログイン後 `/board` を開き、現状は404であることを確認する。承認済みプレビューの2タブ、余白、濃紺ナビ、青い称号バッジ、投稿カード、返信画面を受入チェック項目として記録する。

- [ ] **Step 2: Server Componentの初回表示を作る。** `getCurrentUser()` がnullなら `/login` へredirect。`listBoardPosts(user.id, "all", null)` と公開viewer値を取得して `StudentShell` に渡す。Next.jsのページはServer Component、操作はClient Componentに分離する。

```tsx
export const dynamic = "force-dynamic";
export default async function BoardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const initial = await listBoardPosts(user.id, "all", null);
  const actor = toBoardActor(user.id, user.role.name);
  if (!actor) redirect("/");
  return <StudentShell userName={user.displayName}>
    <BoardFeed initialPosts={initial.posts} initialNextCursor={initial.nextCursor}
      viewer={{ ...actor, displayName: user.displayName }} />
  </StudentShell>;
}
```

- [ ] **Step 3: `BoardFeed` と `PostCard` を実装する。** タブは「すべて」「自分の投稿」だけ。本文入力は `maxLength={280}`、空白のみ投稿ボタン無効。各カードは投稿者名・アイコンから `/board/users/{id}`、本文から `/board/posts/{id}` へ移動する。称号は濃い青の見やすいバッジ、固定教師投稿は先頭に固定表示。いいね、返信、教師だけのピン、本人・教師の削除をカードの操作欄に置く。削除は確認ダイアログを出し、取消時は何もしない。表示本文はReactテキストとして描画し `white-space: pre-wrap` を使う。ページ追加は `nextCursor` がある場合だけ。

```tsx
<button type="button" onClick={() => setScope("mine")} aria-selected={scope === "mine"}>
  自分の投稿
</button>
<textarea maxLength={280} value={draft} onChange={(event) => setDraft(event.target.value)}
  placeholder="今日の学びや、みんなに聞きたいことは？" />
<p className="whitespace-pre-wrap break-words">{post.body}</p>
```

- [ ] **Step 4: `ReplyDialog` を作る。** 一覧の返信操作は投稿元と既存返信を表示するX風ダイアログを開き、280文字の返信欄を置く。`POST /api/board/posts/[postId]/comments` 成功時に返信を画面へ追加し、件数を更新する。HTTP失敗時は本文を保持して日本語エラーを出す。Escと閉じるボタンで閉じられる。

```tsx
const dialogRef = useRef<HTMLDialogElement>(null);
const [draft, setDraft] = useState("");
const [error, setError] = useState("");
async function submitReply() {
  const response = await fetch(`/api/board/posts/${post.id}/comments`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: draft }),
  });
  if (!response.ok) { setError("返信できませんでした。もう一度お試しください。"); return; }
  onSent(await response.json());
  dialogRef.current?.close();
}
useEffect(() => {
  const dialog = dialogRef.current;
  if (!dialog) return;
  dialog.showModal();
  return () => dialog.close();
}, [post.id]);
return <dialog ref={dialogRef} onClose={onClose} aria-label="返信する"
  className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-0 backdrop:bg-slate-900/50">
  <button type="button" onClick={() => dialogRef.current?.close()} aria-label="閉じる">×</button>
  <strong>{post.author.displayName}</strong>
  <p className="whitespace-pre-wrap">{post.body}</p>
  <textarea maxLength={280} value={draft} onChange={(event) => setDraft(event.target.value)}
    placeholder="返信を投稿" />
  {error && <p role="alert">{error}</p>}
  <button type="button" disabled={!draft.trim()} onClick={submitReply}>返信する</button>
</dialog>;
```

- [ ] **Step 5: Run `npm run typecheck`、`npm run lint`。** Expected: 成功。ブラウザーでPC幅とスマートフォン幅、2タブ、通常教師投稿、ピン後の先頭移動、いいね、返信画面、投稿者リンク、削除確認を操作してコミットする。

## Task 7: 投稿単体と公開プロフィール

**Files:** Create `src/app/board/posts/[postId]/page.tsx`、`post-detail.tsx`、`src/app/board/users/[userId]/page.tsx`、`public-profile.tsx`。Reuse `post-card.tsx` と Task 3の読み取り。

**Interfaces:** 投稿単体は `getBoardThread(viewer.id, postId)`、公開プロフィールは `getBoardPublicProfile(viewer.id, userId, null)` を初回取得する。両ページの動的 `params` は `Promise` を `await` する。

- [ ] **Step 1: 失敗基準を記録する。** ログイン後 `/board/posts/00000000-0000-4000-8000-000000000001` と `/board/users/00000000-0000-4000-8000-000000000001` が現状404であること、承認プレビューには詳細の外側の「投稿詳細」見出し・利用開始日・試験名欄がないことを確認する。

- [ ] **Step 2: 投稿単体のServer ComponentとClient Componentを作る。** 非ログインはredirect、UUID不正・削除済み投稿は `notFound()`。上部に戻る操作、元投稿、古い順の未削除返信、返信欄を1カラムで表示する。投稿詳細の外側には「投稿詳細」のH1を置かない。返信成功時はリストと件数を更新し、失敗時は入力を保持する。

```tsx
export default async function BoardPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { postId } = await params;
  if (!isUuid(postId)) notFound();
  const thread = await getBoardThread(user.id, postId);
  if (!thread) notFound();
  return <StudentShell userName={user.displayName}><PostDetail initialThread={thread} /></StudentShell>;
}
```

`post-detail.tsx` の返信欄は下記の状態と送信処理を持ち、画面上では元投稿の下に `comments` を古い順で描画する。

```tsx
const [comments, setComments] = useState(initialThread.comments);
const [draft, setDraft] = useState("");
const [error, setError] = useState("");
async function submitReply() {
  const response = await fetch(`/api/board/posts/${initialThread.post.id}/comments`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: draft }),
  });
  if (!response.ok) { setError("返信できませんでした。もう一度お試しください。"); return; }
  const comment = (await response.json()) as BoardCommentView;
  setComments((current) => [...current, comment]);
  setDraft("");
  setError("");
}
<textarea maxLength={280} value={draft} onChange={(event) => setDraft(event.target.value)}
  placeholder="返信を投稿" />
{error && <p role="alert">{error}</p>}
<button type="button" disabled={!draft.trim()} onClick={submitReply}>返信する</button>
```

- [ ] **Step 3: 公開プロフィールを作る。** 表示名、アイコン、学生の `bio` と装備称号、未削除投稿を表示し、投稿者の本人ページとは区別する。教師は教師バッジと既存アイコンを表示し、架空のbio・称号、試験名、利用開始日、メール・ポイントを出さない。投稿は新着順で追加読込を許す。投稿カードの名前・アイコンから同ページへ移動できる。

```tsx
<h2>{profile.displayName}</h2>
<span>{profile.postCount}件の投稿</span>
{profile.titleName && <span className="rounded bg-blue-50 px-2 py-1 font-bold text-blue-900">{profile.titleName}</span>}
{profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
{profile.isTeacher && <span>先生</span>}
```

- [ ] **Step 4: Run `npm run typecheck`、`npm run lint`。** Expected: 成功。ブラウザーで投稿から詳細、返信、投稿者プロフィール、投稿一覧、戻る操作、無効ID/削除済み404、PC・スマートフォン表示を確認してコミットする。

## Task 8: 全体検証と安全な引き渡し

**Files:** No new production files。検証記録を `docs/superpowers/plans/2026-09-16-board-implementation.md` のチェック欄で管理する。

**Interfaces:** 全TaskのAPIと画面を実環境で接続する。失敗したケースは原因を診断し、該当Taskのファイルとテストだけを修正する。

- [ ] **Step 1: 既存DBの読み取り記録を取る。** 新規4テーブルの存在、RLS有効、既存テーブル・既存マイグレーションが残ることをMCPで確認する。秘密を出力しない。
- [ ] **Step 2: 自動検証を実行する。** Run: `node --test`、`npm run lint`、`npm run typecheck`、`npm run build`、`git diff --check`。Expected: すべて終了コード0。Next.js 16.2.9のローカル文書でRoute Handlerと動的ページを再確認する。
- [ ] **Step 3: 学生・教師の操作を通す。** 学生通常投稿→教師返信→学生いいね→教師通常投稿（初期非固定）→教師ピン→「すべて」の先頭→別の教師投稿もピンして固定内の新着順を確認→解除→元の時系列→本人削除→教師が他人の返信を削除してログ1件、をブラウザーで確認する。確認用内容を作成する場合は識別し、終わった投稿は論理削除のみ行い、何を残したかユーザーに報告する。
- [ ] **Step 4: 権限と公開情報を確認する。** 未ログイン401、学生ピン403、教師による学生投稿ピン403、他人削除403、削除済み投稿404、空白と281文字400、同一いいねが1件、公開プロフィールJSONに非公開値なし。
- [ ] **Step 5: 差分と引き渡し。** `git status` で意図外の変更がないことを確認する。DB・API・UI・検証結果と追加データの有無を日本語で伝える。`git push` は依頼と確認があるまで行わない。
