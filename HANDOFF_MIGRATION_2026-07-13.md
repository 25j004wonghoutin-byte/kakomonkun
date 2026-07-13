# kakomonkun 別環境移行・引継ぎ指示書

更新日: 2026-07-13  
対象プロジェクト: `C:\Users\WONGHOUTIN\Documents\kakomonkun`  
GitHub: `https://github.com/25j004wonghoutin-byte/kakomonkun`  
アプリ名: **目指せ合格！過去問くん**

このファイルは、別PC・別環境・次チャットで開発を再開するための最新版引継ぎメモです。古い `HANDOFF_NEXT_CHAT.md` には、Googleログイン未実装など現在と違う情報が残っているため、まずこのファイルを優先してください。

## 1. 次の担当者への最初の指示

別環境で作業を始める担当者は、最初に次を行ってください。

1. リポジトリ直下の `AGENTS.md` とこのファイルを最後まで読む。
2. `git status --short`、現在ブランチ、最新コミットを確認する。
3. `package.json`、`prisma/schema.prisma`、`src/app/api/`、`src/lib/auth.ts` を確認する。
4. Next.js 16 は既知のNext.jsと差分がある前提で、コードを書く前に必要な範囲の `node_modules/next/dist/docs/` を読む。
5. 日本語を含む既存ファイルを読む・編集する前に、文字コード、BOM、改行コードを確認する。
6. Supabaseの既存DB、既存データ、適用済みマイグレーションを削除・初期化しない。
7. 新しいパッケージ追加、依存関係変更、大きなDB設計変更、ログイン仕様変更、権限仕様変更の前にはユーザーへ確認する。

## 2. 現在のGit状態

2026-07-13時点の確認結果:

```text
branch: main
working tree: clean
latest commits:
856cb10 Ignore secret replacement file
67f3df2 Remove hardcoded example secrets from env file
ee0c1fc ai explain update
d90f307 daily question update
0ad95bc agentsmd update
```

別環境で開始したら、必ず現地でも確認してください。

```bash
git status --short
git branch --show-current
git log --oneline -5
```

## 3. プロジェクト概要

ITパスポート試験・基本情報技術者試験の過去問を学習できるWebアプリです。

主な利用者:

- 学生
  - Googleアカウントでログインする。
  - 一問一答、過去問練習、模擬試験、ポイント、称号、ランキング、掲示板を使う想定。
- 教師
  - 共通アカウントでログインする想定。
  - 管理者相当として、学生進捗、問題登録、模擬試験、掲示板確認などを行う想定。

現時点では、学生向けの認証・ホーム・日替わり問題・過去問練習・AI解説の土台が中心です。教師機能は画面やDB設計の一部があるものの、本格実装前です。

## 4. 技術スタック

主言語は **TypeScript** です。Next.jsの中にフロントエンドとバックエンドAPIを同居させる構成です。

- フロントエンド: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- バックエンド: Next.js API Routes
- ORM: Prisma 7.8
- DB: Supabase PostgreSQL
- 認証: Supabase Auth Google Provider
- AI解説: Gemini API
- デプロイ: Vercel

`package.json` の主要スクリプト:

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run seed:build
```

Prismaは次の構成です。古い `prisma-client-js` へ戻さないでください。

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated"
}
```

## 5. 主要ディレクトリ

```text
src/app/                         画面とApp Router
src/app/api/                     Next.js API Routes
src/app/auth/callback/route.ts   Supabase Authコールバック
src/app/auth/signout/route.ts    ログアウト
src/components/                  UIコンポーネント
src/lib/                         認証、Prisma、Supabase、Gemini、HTTP共通処理
src/proxy.ts                     Supabaseセッション更新・保護用proxy
prisma/schema.prisma             Prisma DBスキーマ
prisma/generated/                Prisma生成物
supabase/migrations/             DBマイグレーション
supabase/seed.sql                初期シード
supabase/generated-question-seed.json 変換済み過去問シード候補
scripts/build-question-seed.mjs  過去問シード生成
scripts/upsert-question-seed.mjs 過去問シード投入補助
kakomon/                         過去問元データ・画像の一部
public/kakomon/                  画面表示用の過去問画像
```

## 6. 環境変数

`.env.example` の内容を基準に、別環境で `.env.local` などGit管理外ファイルへ設定してください。値はGitやチャットへ貼らないでください。

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

補足:

- 旧環境や古い資料では `NEXT_PUBLIC_SUPABASE_ANON_KEY` が出てくる場合があります。現行は `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を優先します。
- `DATABASE_URL` はPrisma/Supabase PostgreSQL接続に必要です。
- `GEMINI_API_KEY` がない場合、AI解説APIは失敗します。
- `npm ci` 後の `postinstall` で `prisma generate` が走るため、環境変数不足による失敗に注意してください。

## 7. ローカル移行手順

```bash
git clone https://github.com/25j004wonghoutin-byte/kakomonkun.git
cd kakomonkun
git status --short
git log --oneline -5
```

Git管理外の `.env.local` などを作成し、必要な環境変数を設定します。

その後:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run dev
```

確認URL:

```text
http://localhost:3000/
http://localhost:3000/login
http://localhost:3000/practice
```

開発用テストログインが有効な環境では、教師ログイン画面から `test-student` を使って学生テストアカウントで練習画面へ移動できます。詳細は `src/app/login/teacher/page.tsx` と `src/app/api/dev/test-student-login/route.ts` を確認してください。

## 8. 現在実装済みのDB

`prisma/schema.prisma` に現行スキーマがあります。

主なテーブル:

- `roles`
- `users`
- `student_profiles`
- `teacher_profiles`
- `exams`
- `question_categories`
- `questions`
- `question_choices`
- `daily_qa_answers`
- `practice_sessions`
- `practice_session_questions`
- `practice_answers`
- `point_transactions`
- `mock_exams`
- `mock_exam_questions`
- `mock_attempts`
- `mock_answers`
- `titles`
- `user_titles`
- `monthly_rankings`
- `ai_explanations`
- `ai_usage_logs`

適用済みマイグレーション:

```text
20260619005536_init_priority_1_core_and_questions.sql
20260619005636_add_questions_created_by_index.sql
20260619011341_drop_legacy_test_user_post.sql
20260619011713_add_practice_and_points.sql
20260619011723_add_question_source_fields.sql
20260701000100_add_priority_2_learning_gamification.sql
```

注意:

- 適用済みマイグレーションを書き換えないでください。
- 既存DBをリセットしないでください。
- DB変更が必要な場合は、新規マイグレーションとして追加してください。
- 画面からSupabase DBへ直接アクセスせず、Next.js APIとPrismaを通す方針です。

## 9. 現在の認証

Supabase AuthのGoogleログイン導線は実装済みです。

関連ファイル:

```text
src/components/google-login-button.tsx
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/app/auth/callback/route.ts
src/app/auth/signout/route.ts
src/lib/auth.ts
src/proxy.ts
```

現在の挙動:

- 未ログイン時は `/login?next=...` へ誘導する。
- Googleログイン後、`/auth/callback` でSupabaseセッションを交換する。
- 初回ログイン時に `users` と `student_profiles` を自動作成する。
- `getCurrentUser()` はSupabase Authのユーザーからアプリ側ユーザーを取得する。
- 開発用テストログインが有効な場合は、専用Cookieのユーザーを優先する。

既知の注意点:

- Vercel本番ログインで `/login?error=auth_callback_failed` が発生するケースが報告されています。
- 原因候補は、Vercel環境変数、Supabase Redirect URL、Google OAuth設定、`exchangeCodeForSession`、`ensureAppUser()` 内のDB処理です。
- 切り分け時は `/auth/callback` に段階別ログや `stage=exchange` / `stage=provision` のようなエラー情報を追加するとよいです。

## 10. 現在の画面

実装済みの主な画面:

```text
/                              学生ホーム
/login                         学生Googleログイン
/login/teacher                 教師ログイン風UI・開発用テストログイン入口
/practice                      過去問練習開始
/practice/[sessionId]          練習問題回答
/practice/[sessionId]/result   練習結果
```

学生ホーム:

- 日替わり一問一答風UI
- ポイント、称号数、練習数などの表示
- AI解説ボタン
- 過去問練習への導線

過去問練習:

- 試験種別と問題数を指定してセッション開始
- 問題・選択肢表示
- 画像問題表示
- 回答、正誤判定、解説表示
- AI解説生成
- 終了処理と結果表示
- ポイント反映

教師ログイン画面:

- UIはあります。
- 本格的な教師共通アカウント認証は未実装です。
- 開発用には `test-student` などで学生テストログインする導線があります。

## 11. 現在のAPI

主なAPI:

```text
GET  /api/me
GET  /api/daily-qa
POST /api/daily-qa
POST /api/ai/explanation
POST /api/practice/sessions
GET  /api/practice/sessions/[sessionId]
POST /api/practice/sessions/[sessionId]/answer
POST /api/practice/sessions/[sessionId]/ai-explanation
POST /api/practice/sessions/[sessionId]/finish
POST /api/dev/test-student-login
GET  /auth/callback
POST /auth/signout
```

過去問練習APIで実装済み:

- 練習セッション作成
- ランダム出題
- セッション内問題の固定
- 回答保存
- 二重回答防止
- 正誤判定
- 終了処理
- 二重完了時の既存結果返却
- ポイント付与
- `student_profiles` の累計値更新

日替わり問題API:

- 公開済み問題からランダム取得
- 回答の正誤判定
- 正解選択肢・解説返却

現時点で、日替わり問題の回答履歴保存や日次ポイント付与は完成扱いにしないでください。

AI解説API:

- `GEMINI_API_KEY` と `GEMINI_MODEL` を使う。
- `ai_explanations` に問題・モデル単位でキャッシュする。
- `ai_usage_logs` に利用ログを残す。
- 練習問題側では回答後のみAI解説を呼べる設計です。

## 12. 問題データ

リポジトリ内:

- `kakomon/` に過去問データ・画像の一部があります。
- `public/kakomon/` に画面表示用画像があります。
- `supabase/generated-question-seed.json` に変換済みシード候補があります。
- `scripts/build-question-seed.mjs` でシード生成できます。
- `scripts/upsert-question-seed.mjs` で投入補助ができます。

古い資料では元データの場所として次が出ています。

```text
C:\Users\WONGHOUTIN\Desktop\kakomon
```

別環境で全データを扱う場合は、元データ一式のコピーが必要になる可能性があります。パスが変わる場合は `KAKOMON_SOURCE_DIR` の利用も検討してください。

## 13. 未完成・注意すべき機能

優先度高:

- 日本語文言の文字化けが残っていないか再確認する。
- 本番VercelのGoogleログイン失敗を切り分ける。
- 教師共通アカウントの実ログイン処理を決める。
- roleに応じた画面遷移・API権限を完成させる。
- 日替わり一問一答の履歴保存とポイント付与を完成させる。
- 過去問練習の年度・カテゴリ・問題数指定を強化する。
- 過去問データと画像パスを本番環境で安定表示できるよう整理する。

今後実装予定:

- 練習履歴一覧
- 間違えた問題の復習
- 模擬試験作成・回答・採点・制限時間
- 教師ダッシュボード
- 学生一覧・学生進捗詳細
- 問題登録・編集
- 称号マスタ、称号交換、装備
- 月間ランキング
- ポイント履歴画面
- 掲示板投稿、コメント、教師確認、削除
- お知らせ、通知、既読管理

## 14. 推奨する次の作業順

1. 別環境で `.env.local` を設定し、`npm ci`、`typecheck`、`lint`、`build` を通す。
2. `/login`、`/`、`/practice`、`/practice/[sessionId]`、`/practice/[sessionId]/result` を手動確認する。
3. Googleログインの本番・ローカル差分を切り分ける。
4. 文字化けや表示崩れがあれば先に直す。
5. 日替わり一問一答の履歴保存とポイント付与を実装する。
6. 過去問練習の年度・カテゴリ指定を追加する。
7. 教師ログイン仕様をユーザーへ確認し、教師ダッシュボードへ進む。
8. 模擬試験、称号、ランキング、掲示板へ進む。

## 15. 作業上の禁止・注意

- `.env.local` や接続文字列をGitへコミットしない。
- 環境変数の値をチャットへ貼らない。
- Supabaseの既存データを削除・初期化しない。
- 適用済みマイグレーションを書き換えない。
- `main` へ勝手にforce pushしない。
- `package.json` の依存関係変更は事前確認する。
- 大きなDB設計変更は事前確認する。
- ログイン仕様・学生/教師/管理者の権限仕様変更は事前確認する。
- UI全体の大幅変更は、ユーザーから画面詳細が来るまで勝手に進めない。
- 一問一答と過去問練習の履歴を混同しない。
- 日次・月次判定は `Asia/Tokyo` 基準で扱う。
- `SUPABASE_SERVICE_ROLE_KEY` を使う場合でも、ブラウザ側へ絶対に出さない。

## 16. 文字コード注意

このリポジトリは日本語テキストと混在エンコーディングの可能性があります。

既存ファイルを読む・編集する前に確認するもの:

- 推定エンコーディング
- BOM有無
- 改行コード

特に注意:

- 文字化けが疑われる状態で保存しない。
- UTF-8変換は別タスクとして扱う。
- 既存ファイルのBOMや改行コードを不用意に変えない。
- 編集後は代表的な日本語行を再読込して確認する。
- 置換文字、予期しない `?`、意図しないBOM変更、全体差分が出た場合は止まって報告する。

## 17. 移行先チャットへ貼る短い開始プロンプト

```text
GitHubのkakomonkunプロジェクトを別環境で続けます。
最初にリポジトリ直下のAGENTS.mdとHANDOFF_MIGRATION_2026-07-13.mdを最後まで読んでください。
git status、最新コミット、package.json、prisma/schema.prisma、src/app/api、src/lib/auth.tsを確認してください。
既存DB、既存データ、適用済みマイグレーションは削除・初期化しないでください。
このプロジェクトはNext.js 16なので、コードを書く前に必要な範囲のnode_modules/next/dist/docsも確認してください。
確認後、現在できていること、未完成のこと、次に進める作業案を短く整理してから実装に入ってください。
```

