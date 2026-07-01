# kakomonkun 現状進捗と今後の実装予定

更新日: 2026-07-01  
対象プロジェクト: `C:\Users\WONGHOUTIN\Documents\kakomonkun`  
アプリ名: 目指せ合格！過去問くん

## 1. プロジェクト概要

このプロジェクトは、ITパスポート試験・基本情報技術者試験の過去問を学習できるWebアプリです。

主な対象ユーザーは以下です。

- 学生
  - Googleログインのみで利用する
  - 一問一答、過去問練習、模擬試験、ポイント、称号、ランキング、掲示板を利用する
- 教師
  - 共通アカウントでログインする想定
  - 管理者と同等の権限として扱う
  - 学生進捗、問題登録、模擬試験管理、掲示板確認などを行う

技術スタックは以下です。

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7
- Supabase PostgreSQL
- Supabase Auth Google Provider
- Vercel

## 2. これまでに完了した主な作業

### DB・Prisma

- Prisma schemaを作成し、優先度の高いDBテーブルをSupabase PostgreSQLへ反映済み。
- テスト用の旧 `User` / `Post` テーブルは不要として削除済み。
- 現在の主なテーブル:
  - `roles`
  - `users`
  - `student_profiles`
  - `teacher_profiles`
  - `exams`
  - `question_categories`
  - `questions`
  - `question_choices`
  - `practice_sessions`
  - `practice_session_questions`
  - `practice_answers`
  - `point_transactions`
- 過去問練習とポイント付与に必要な最低限のDB構造は実装済み。
- Supabase側のプロジェクト名は `kakomonkun`。

### 過去問データ

- 使用許可済みの過去問ファイル元:
  - `C:\Users\WONGHOUTIN\Desktop\kakomon`
- リポジトリ内にも `kakomon/` 配下へ一部データ・画像が取り込まれている。
- 変換スクリプト:
  - `scripts/build-question-seed.mjs`
- 生成済みシード候補:
  - `supabase/generated-question-seed.json`
- 現時点では全データ投入は未完了。まずはテスト用・初期動作用の問題データを扱っている状態。

### 認証

- Supabase AuthのGoogleログイン導線を実装済み。
- 学生はGoogleログイン後、初回ログイン時に `users` と `student_profiles` を自動作成する設計。
- `/auth/callback` ルートを追加済み。
- `/auth/signout` ルートを追加済み。
- `proxy.ts` による認証保護を実装済み。
- 未ログイン時は `/login?next=...` へ遷移する。
- `/api/me` で現在ログイン中ユーザーの基本情報を取得できる。

### フロント画面

簡易モックベースで、以下の画面を実装済みです。

- `/login`
  - 学生向けGoogleログイン画面
- `/login/teacher`
  - 教師ログイン画面の簡易UI
  - 現時点では見た目のみで、実ログイン処理は未実装
- `/`
  - 学生ホーム画面
  - 今日の一問一答風UI
  - ポイント・称号数の簡易表示
- `/practice`
  - 過去問練習開始画面
- `/practice/[sessionId]`
  - 練習問題回答画面
- `/practice/[sessionId]/result`
  - 練習結果画面

### API

以下のAPIを実装済みです。

- `GET /api/me`
- `POST /api/practice/sessions`
- `GET /api/practice/sessions/[sessionId]`
- `POST /api/practice/sessions/[sessionId]/answer`
- `POST /api/practice/sessions/[sessionId]/finish`

過去問練習APIでは、主に以下を行います。

- 試験種別を指定して練習セッションを作成
- 問題をランダムに出題
- 回答保存
- 正誤判定
- セッション完了
- ポイント付与
- 学生プロフィールの集計値更新

## 3. 現在確認できている問題・注意点

### 3.1 ログイン画面やホーム画面の日本語テキストが文字化けしている

現在、以下のファイルなどで日本語テキストが文字化けしている状態です。

- `src/app/login/page.tsx`
- `src/components/login-screen.tsx`
- `src/components/google-login-button.tsx`
- `src/app/login/teacher/page.tsx`
- `src/app/page.tsx`
- `src/app/practice/page.tsx`
- `src/lib/auth.ts` の一部フォールバック文字列

次の優先修正候補です。UIや認証動作以前に、表示文言を正常な日本語へ戻す必要があります。

### 3.2 Vercel本番ログインで `auth_callback_failed` が発生している

確認済みの状況:

- Supabase側のGoogle認証リクエスト自体は成功しているログがある。
- ただし、Vercel本番URLではログイン後に `/login?error=auth_callback_failed` へ戻るケースがある。
- 原因候補:
  - Vercelの `DATABASE_URL` など環境変数の不一致
  - `/auth/callback` 内の `exchangeCodeForSession` 失敗
  - `ensureAppUser()` 内でのDB作成・更新失敗
  - Supabase Redirect URL / Site URL / Google OAuth設定の不整合

次に行うべきこと:

- Vercel Runtime Logsで `/auth/callback` の具体的なエラーを確認する。
- 必要に応じて `/auth/callback` に `stage=exchange` / `stage=no_user` / `stage=provision` のような段階別エラー表示を追加する。
- Vercel側の環境変数を再確認する。

### 3.3 未コミット変更がある

現時点の作業ツリーには、以下の未コミット変更があります。

- `.codex-dev-error.log`
- `.codex-dev.log`
- `src/app/login/page.tsx`
- `src/components/google-login-button.tsx`
- `src/app/login/teacher/page.tsx`
- `src/components/login-screen.tsx`

ログファイルは開発サーバー実行による副産物の可能性が高いです。  
コード側の未コミット変更は、ログイン画面・教師ログイン画面まわりです。

## 4. まだ未完成の機能

### 認証・権限

- 教師共通アカウントの実ログイン処理
- 教師ログイン後の教師ダッシュボード遷移
- roleに応じた画面分岐の完成
- ログイン失敗時の詳細なエラー表示
- 本番Vercel環境でのGoogleログイン安定化

### 学習機能

- 今日の一問一答のDB連携
- 一問一答の回答履歴保存
- 過去問練習の問題数・カテゴリ・年度選択
- 練習履歴一覧
- 間違えた問題の復習
- 過去問データの本格投入
- 画像問題の表示確認・パス整理

### 模擬試験

- 模擬試験用DB
- 模擬試験作成
- 模擬試験開始・回答・採点
- 制限時間
- 結果表示
- 教師による模擬試験管理

### ポイント・称号・ランキング

- 称号マスタ
- 称号交換
- ユーザー所持称号
- 月間ランキング
- ポイント付与ルールの調整
- ポイント履歴画面

### 掲示板・通知

- 掲示板投稿
- コメント
- 教師による確認・削除
- お知らせ
- 通知
- 既読管理

### 教師画面

- 教師ダッシュボード
- 学生一覧
- 学生進捗詳細
- 問題登録・編集
- 模擬試験管理
- 掲示板管理
- お知らせ管理

## 5. これからの推奨実装順序

現在の状態からは、以下の順番で進めるのが安全です。

1. 文字化け修正
   - ログイン画面、ホーム画面、練習画面、共通コンポーネントの日本語文言を復旧する。
   - 先にこれを直すと、以後のテスト確認がかなり楽になる。

2. 本番ログイン失敗の原因切り分け
   - `/auth/callback` のエラー段階をログ・URLで判別できるようにする。
   - Vercel Runtime LogsとSupabase Auth Logsを照合する。
   - 必要ならVercel環境変数・Supabase Redirect URLを再確認する。

3. 学生ログイン後の基本導線を完成
   - Googleログイン
   - 初回学生プロフィール作成
   - ホーム表示
   - 過去問練習開始
   - 回答
   - 結果表示
   - ポイント反映

4. 過去問練習画面の安定化
   - APIエラー時に `Unexpected end of JSON input` のような生エラーを出さない。
   - APIレスポンスを常にJSONへ統一する。
   - 問題画像の表示を確認する。
   - 問題数、年度、カテゴリ指定を追加する。

5. 過去問データ投入の拡張
   - `C:\Users\WONGHOUTIN\Desktop\kakomon` の元データを再確認する。
   - ITパスポート・基本情報のデータ変換精度を確認する。
   - 画像パスを本番環境でも参照できる形に整理する。
   - DB投入対象を段階的に増やす。

6. 教師ログイン・教師画面
   - 共通教師アカウントの仕様を確定する。
   - 教師ログインAPIを実装する。
   - 教師ダッシュボードを作成する。
   - 学生進捗一覧を実装する。

7. 優先度2機能
   - 模擬試験
   - 称号
   - ランキング
   - ポイント拡張

8. 優先度3機能
   - 掲示板
   - お知らせ
   - 通知
   - 管理ログ

9. UI詳細資料反映
   - 後ほど届く画面詳細に合わせて、簡易モックから正式UIへ調整する。

10. 本番リリース前確認
    - `npm run lint`
    - `npm run typecheck`
    - `npm run build`
    - Vercel環境変数確認
    - Supabase Auth設定確認
    - Google OAuth設定確認
    - 主要導線の手動テスト

## 6. 環境変数・設定メモ

ローカルとVercelの両方で、少なくとも以下が必要です。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=
```

Supabase Authの設定目安:

- Site URL:
  - `https://kakomonkun.vercel.app`
- Redirect URLs:
  - `https://kakomonkun.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Vercelの固定ドメイン:

- `https://kakomonkun.vercel.app`

注意:

- 環境変数の値はGitにコミットしない。
- `SUPABASE_SERVICE_ROLE_KEY` をブラウザ側へ出さない。
- DBの既存データや適用済みマイグレーションを不用意に削除・初期化しない。

## 7. 次回作業を始める前の確認コマンド

```bash
git status --short
git log --oneline -5
npm run typecheck
npm run lint
```

必要に応じて:

```bash
npm run build
npm run dev
```

## 8. 次のチャットへの短い指示文

次のチャットで作業を再開する場合は、以下を伝えるとスムーズです。

```text
C:\Users\WONGHOUTIN\Documents\kakomonkun の kakomonkun プロジェクトを続けます。
まず AGENTS.md と PROJECT_STATUS_AND_PLAN.md を読んで、git status を確認してください。
既存DBやSupabaseのデータは削除・初期化しないでください。
現状は、DB・過去問練習API・Googleログイン導線・簡易フロントはある程度実装済みです。
ただし、画面文言の文字化けと、本番Vercelでの auth_callback_failed の切り分けが残っています。
最初は実装に入る前に、これから行う作業内容を整理して私に確認してください。
```
