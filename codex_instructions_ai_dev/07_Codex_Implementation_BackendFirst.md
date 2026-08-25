# Codex実装指示：バックエンド優先

## 1. 最初のゴール

Codexは、まず以下の学生フローが動くところまで実装する。

```text
ログイン済みユーザーを取得
  ↓
過去問練習を開始
  ↓
DBから問題を取得
  ↓
問題と選択肢を表示
  ↓
回答する
  ↓
正誤判定
  ↓
回答履歴を保存
  ↓
練習終了
  ↓
ポイントを付与
```

## 2. 実装順

### Step 1: Prisma schema

以下の順で `schema.prisma` を作成する。

1. roles
2. users
3. student_profiles
4. teacher_profiles
5. exams
6. question_categories
7. questions
8. question_choices
9. practice_sessions
10. practice_answers
11. point_transactions

ここまでできたら、最初の練習フローが作れる。

次に追加する。

12. daily_qa_answers
13. mock_exams
14. mock_exam_questions
15. mock_attempts
16. mock_answers
17. titles
18. user_titles
19. monthly_rankings
20. board_posts
21. board_comments
22. announcements
23. notifications
24. user_notifications
25. audit_logs

### Step 2: Prisma client設定

推奨構成:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`src/lib/prisma.ts` 例:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### Step 3: seed

最低限のseedを作る。

```text
roles:
- student
- teacher
- admin

exams:
- ITパスポート
- 基本情報技術者

question_categories:
- テクノロジ系
- マネジメント系
- ストラテジ系

titles:
- はじめの一歩
- 努力家
- テクノロジーマスター
- 模擬試験チャレンジャー

users:
- student demo user
- teacher demo user

questions:
- ITパスポート 3問程度
- 基本情報技術者 3問程度
```

## 3. API設計

Next.js App Routerを前提にする。

### 3.1 認証・ユーザー

```text
GET /api/me
```

返す内容:

```json
{
  "id": "user id",
  "displayName": "表示名",
  "role": "student",
  "profile": {
    "totalPoints": 100,
    "currentTitle": "努力家"
  }
}
```

### 3.2 一問一答

```text
GET  /api/daily-qa
POST /api/daily-qa/answer
```

`GET /api/daily-qa`

- 今日の一問一答を返す。
- すでに回答済みなら回答結果も返す。

`POST /api/daily-qa/answer`

リクエスト例:

```json
{
  "questionId": "uuid",
  "selectedChoiceId": "uuid"
}
```

処理:

1. 今日すでに回答済みか確認
2. 正誤判定
3. `daily_qa_answers` に保存
4. 初回回答なら `point_transactions` に +1
5. 正解なら追加で +1
6. `student_profiles.total_points` を更新
7. 結果を返す

### 3.3 過去問練習

```text
POST /api/practice/sessions
GET  /api/practice/sessions/[sessionId]
POST /api/practice/sessions/[sessionId]/answer
POST /api/practice/sessions/[sessionId]/finish
```

`POST /api/practice/sessions`

リクエスト:

```json
{
  "examCode": "it_passport",
  "questionCount": 10
}
```

処理:

1. examCodeからexam取得
2. publishedの問題をランダムまたは新しい順で取得
3. practice_sessions作成
4. 問題一覧を返す

`POST /api/practice/sessions/[sessionId]/answer`

リクエスト:

```json
{
  "questionId": "uuid",
  "selectedChoiceId": "uuid"
}
```

処理:

1. session存在確認
2. 選択肢がその問題のものか確認
3. 正誤判定
4. practice_answers保存
5. sessionのanswered_count/correct_count更新
6. 正誤と解説を返す

`POST /api/practice/sessions/[sessionId]/finish`

処理:

1. sessionをcompletedにする
2. 正解数を確認
3. ポイント計算
   - 過去問練習完了: 5pt
   - 日に2回まで
   - 10問正解ごとに1pt
4. point_transactions作成
5. student_profiles更新
6. 結果を返す

### 3.4 模擬試験

```text
GET  /api/mock-exams/current
POST /api/mock-exams/[mockExamId]/start
POST /api/mock-attempts/[attemptId]/answer
POST /api/mock-attempts/[attemptId]/submit
```

処理方針:

- 月1回だけ受験可能。
- 受験完了時に20pt付与。
- `mock_attempts` と `mock_answers` に保存。
- 模擬試験結果はランキングにも使える。

### 3.5 ランキング

```text
GET  /api/rankings/monthly
POST /api/admin/rankings/calculate
```

`GET /api/rankings/monthly`

- 当月ランキングを返す。
- 上位3名を中心に表示。
- 自分の順位も返せるとよい。

`POST /api/admin/rankings/calculate`

教師または管理者のみ。

処理:

1. 月間ポイントを集計
2. ランキングを作成
3. `monthly_rankings` に保存
4. 上位3名に報酬を付与
   - 1位 150pt
   - 2位 100pt
   - 3位 75pt

### 3.6 称号

```text
GET  /api/titles
POST /api/titles/purchase
POST /api/profile/equip-title
```

`POST /api/titles/purchase`

処理:

1. 称号が存在するか確認
2. すでに所持していないか確認
3. ポイントが足りるか確認
4. user_titles作成
5. point_transactionsにマイナスを保存
6. total_points更新

### 3.7 掲示板

```text
GET    /api/board/posts
POST   /api/board/posts
GET    /api/board/posts/[postId]
POST   /api/board/posts/[postId]/comments
```

注意:

- リアルタイム処理は不要。
- 投稿一覧には複数投稿を表示する。
- 投稿詳細でコメントを表示する。

## 4. フロントエンド実装順

バックエンドがある程度できたら、以下の順で最低限の画面を作る。

1. ログイン後の仮ユーザー取得
2. 学生ホーム
3. 過去問練習開始
4. 過去問練習問題
5. 過去問練習終了
6. ランキング
7. 称号ショップ
8. プロフィール
9. 掲示板一覧
10. 掲示板詳細
11. 教師ダッシュボード

## 5. Tailwind UI方針

デザインは最初から凝りすぎない。  
先に機能確認しやすいUIを作る。

共通方針:

- 白背景
- カード型レイアウト
- ボタンはわかりやすく
- 学生が「次に何をすればよいか」迷わない画面にする
- ホームは一問一答を大きく表示
- 学習状況はプロフィールへ集約
- 右上ユーザー名は全画面で統一

## 6. roleチェック

APIでは必ずroleチェックする。

| API | 許可 |
|---|---|
| 学生の練習API | student / teacher / admin |
| 教師管理API | teacher / admin |
| 管理者API | admin |
| 掲示板閲覧 | student / teacher / admin |
| 掲示板投稿 | student / teacher / admin |

## 7. 二重付与防止

ポイント付与は二重付与しやすいので注意する。

### 一問一答

- `daily_qa_answers` の `unique(user_id, answer_date)` で防ぐ。

### 過去問練習完了

- 1日2回まで。
- `practice_sessions` のcompleted件数を日付で数える。

### 模擬試験

- `mock_attempts` の `unique(mock_exam_id, user_id)` で防ぐ。

### ランキング報酬

- `monthly_rankings.reward_points` と `point_transactions` を確認して二重付与を防ぐ。

## 8. Vercelデプロイ注意

`package.json` に以下を入れることを推奨する。

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "postinstall": "prisma generate",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "prisma db seed"
  }
}
```

環境変数:

```text
DATABASE_URL=Supabase PostgreSQL connection string
DIRECT_URL=Supabase direct connection string if needed
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

注意:

- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使う。
- フロントに出してはいけない。
- `NEXT_PUBLIC_` が付くものだけフロントで使える。

## 9. 完了条件

最初の完了条件:

- Prisma migrateが成功する。
- seedが入る。
- `/api/practice/sessions` で練習セッションが作成できる。
- `/api/practice/sessions/[id]/answer` で正誤判定できる。
- `/api/practice/sessions/[id]/finish` で履歴保存とポイント加算ができる。
- 学生ホームから過去問練習を開始できる。
- 練習終了後にポイントが増えている。
