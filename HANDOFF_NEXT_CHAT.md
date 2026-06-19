# kakomonkun 開発引継ぎ指示書

更新日: 2026-06-19  
対象リポジトリ: `https://github.com/25j004wonghoutin-byte/kakomonkun.git`

## 1. 次のCodexへの最初の指示

以下を最初に実行してください。

1. この文書とリポジトリ直下の `AGENTS.md` を最後まで読む。
2. `git status`、現在ブランチ、最新コミットを確認する。
3. Supabaseの既存テーブルとマイグレーションを読み取り確認する。
4. 既存データやマイグレーションを初期化・削除しない。
5. 実装前に、今回進める範囲をユーザーへ短く整理して確認する。
6. 画面詳細資料が新たに提示された場合、現在の簡易UIをその資料へ合わせて変更する。

現在の基準コミット:

```text
branch: main
commit: 3637ecc85bc20be3e414aea3490fe88704fe9ca1
message: update front
origin/mainと同期済み
作業ツリーはクリーン
```

## 2. プロジェクト概要

アプリ名: **目指せ合格！過去問くん**

ITパスポート試験と基本情報技術者試験を対象にした学習Webアプリ。

最終的な主要機能:

- 学生のGoogleログイン
- ホームの一問一答
- 過去問練習
- 月1回の模擬試験
- 月間ランキング
- ポイント
- 称号ショップ・称号装備
- プロフィール・学習状況
- 投稿・コメント型掲示板
- 教師用の学生進捗・問題・模擬試験管理

教師と管理者の権限は同一として扱い、独立した管理者の概念は当面無視する。

## 3. 採用技術

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7.8
- `@prisma/adapter-pg`
- Supabase PostgreSQL
- 将来の認証: Supabase Auth Google Provider
- Vercel

Prismaは現行のPrisma 7構成を維持する。

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated"
}
```

古い資料にある `prisma-client-js` へ戻さないこと。

## 4. 環境・接続先

Supabase接続済みプロジェクト:

```text
project name: kakomonkun
project URL: https://ckgoikdjhtklhbzdgxxs.supabase.co
```

Vercel側にはDB接続用環境変数が設定済みで、デプロイ環境では過去問練習が動作している。

別PCでローカル実行する場合、Gitには環境変数が含まれないため、先にローカル用の環境変数を設定すること。

最低限:

```text
DATABASE_URL=Supabase PostgreSQL connection string
```

注意:

- 値をチャットやGitへ貼らない。
- `prisma.config.ts` は `dotenv/config` を利用している。
- `npm ci` の `postinstall` で `prisma generate` が動くため、`DATABASE_URL`未設定だとインストール終盤で失敗する可能性がある。
- 必要ならGit管理対象外の `.env` を作成してから `npm ci` を実行する。

## 5. 現在完成しているDB

Supabaseへ適用済み:

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

旧テスト用の大文字テーブル `User` と `Post` は削除済み。

適用済みマイグレーション:

```text
20260619005536 init_priority_1_core_and_questions
20260619005636 add_questions_created_by_index
20260619011341 drop_legacy_test_user_post
20260619011713 add_practice_and_points
20260619011723 add_question_source_fields
```

ローカルSQL:

```text
supabase/migrations/
```

全テーブルでRLSを有効化済み。現在はポリシー未作成で、ブラウザからDBへ直接アクセスさせず、Next.js APIとPrismaを通す方針。

## 6. Supabase上の現在データ

2026-06-19確認時:

```text
roles: 2
users: 1
student_profiles: 1
teacher_profiles: 0
exams: 2
question_categories: 3
questions: 6
question_choices: 24
practice_sessions: 5
practice_session_questions: 15
practice_answers: 9
point_transactions: 2
```

練習セッション・回答・ポイントにはユーザーがVercel上で行ったテスト結果が含まれる。勝手に削除・初期化しないこと。

seed済みユーザー:

```text
student@example.com
表示名: デモ学生
```

seed済み問題:

- ITパスポート: 3問
- 基本情報技術者: 3問

## 7. 問題データ

旧PC上の元データ:

```text
C:\Users\WONGHOUTIN\Desktop\kakomon
```

主な内容:

- `questions.json`: 補助問題31問
- `kakomon_questionsA.json`: 基本情報科目A 120問
- `kakomon_questionsS.json`: 修了認定試験形式 1,880問
- `kakomon_answers.json`: 正答
- `category_questions.json`
- 問題画像
- 科目B PDF

Gitへ含まれているもの:

- 31問＋科目A 120問を変換した `supabase/generated-question-seed.json`（計151問）
- 変換スクリプト `scripts/build-question-seed.mjs`
- 科目Aで参照する画像19枚
- 初期6問用 `supabase/seed.sql`

元データ一式や1,880問、科目B PDFはGitへ全て入っていない。全問題の再変換・追加投入を行う場合、別PCへ元の `kakomon` フォルダをコピーし、必要に応じて次を設定する。

```text
KAKOMON_SOURCE_DIR=<別PC上のkakomonフォルダ>
```

変換:

```bash
npm run seed:build
```

現時点では151問を変換済みだが、DBへ投入済みなのは6問だけ。

## 8. 完成しているバックエンドAPI

```text
GET  /api/me
POST /api/practice/sessions
GET  /api/practice/sessions/[sessionId]
POST /api/practice/sessions/[sessionId]/answer
POST /api/practice/sessions/[sessionId]/finish
```

実装済み処理:

- 試験を指定して3問の練習セッションを作成
- セッションごとの出題問題固定
- 問題・選択肢取得
- 回答保存
- 正誤判定
- 回答数・正解数更新
- 練習終了
- 日本時間基準で完了ポイント判定
- 練習完了5pt（1日2回まで）
- 10問正解ごとのボーナス計算
- `point_transactions`への履歴保存
- `student_profiles`の集計値更新
- 二重回答・二重ポイント防止

## 9. 現在の認証は暫定実装

Googleログインは未実装。

`src/lib/auth.ts` は次の暫定方式:

- `x-user-id`ヘッダーがあればそのユーザー
- なければ `student@example.com` のデモ学生

本番認証実装時に、ここをSupabase Authのサーバー側セッション確認へ差し替える。

重要:

- 学生はGoogleログインのみ。
- 教師は事前登録アカウント。
- 教師と管理者の権限は同一。
- Googleログイン後、初回のみ `users` と `student_profiles` を自動作成する。

## 10. 完成しているフロント画面

簡易モックを基に実装済み:

```text
/                              学生ホーム
/practice                      過去問練習開始
/practice/[sessionId]          問題回答
/practice/[sessionId]/result   練習結果
```

共通UI:

- ロゴ
- 通知ベル
- ユーザー表示
- 学生ナビゲーション
- PC・スマートフォン対応
- エラー・ローディング表示

学生ホーム:

- 一問一答UI
- ポイント・称号・練習回数表示
- 過去問練習への導線

注意: ホームの一問一答は現在フロント内の固定問題であり、DB保存やポイント付与は未実装。

過去問練習画面:

- 試験選択
- APIで3問セッション開始
- 回答・正誤表示
- 問題画像表示
- 問題移動
- 終了・結果表示

## 11. 検証済み項目

実装時に成功済み:

```bash
npm run typecheck
npm run lint
npm run build
```

確認済み:

- Prisma schema validate
- Prisma Client生成
- Next.js production build
- PC表示
- スマートフォン表示
- 横方向オーバーフローなし
- ホーム一問一答操作
- 練習開始画面
- DBトランザクションによるセッション・回答・ポイント制約
- Vercel上で過去問練習が動作

ユーザーが一度ローカル環境で `Unexpected end of JSON input` を確認したが、原因はローカルに `DATABASE_URL` がなくAPIが失敗していたため。Vercel上は環境変数設定済みで、ユーザー確認時にはエラーなし。

改善候補:

- フロントの `response.json()` を、空レスポンスや非JSONの500レスポンスでも安全に処理する共通関数へ変更する。
- API最上位で例外をJSONレスポンスへ統一する。

## 12. 未完成の機能

### 認証

- Supabase Auth Googleログイン
- Googleコールバック
- 初回学生プロフィール作成
- 教師ログイン
- ログアウト
- roleに応じた画面・API保護

### 優先度2 DB・機能

- `daily_qa_answers`
- `mock_exams`
- `mock_exam_questions`
- `mock_attempts`
- `mock_answers`
- `titles`
- `user_titles`
- `monthly_rankings`

### 優先度3 DB・機能

- `board_posts`
- `board_comments`
- `announcements`
- `notifications`
- `user_notifications`
- `audit_logs`
- 必要に応じて `point_rule_configs`

### フロント

- ログイン画面
- 模擬試験開始・回答・結果
- ランキング
- 称号ショップ
- プロフィール
- 学習状況詳細
- 掲示板一覧・詳細・投稿
- 教師ダッシュボード
- 学生一覧
- 問題登録
- 模擬試験管理
- 通知一覧

### 問題データ

- 変換済み151問のうち残り145問のDB投入
- 修了認定試験形式1,880問の検証・変換・投入
- 科目B PDFのデータ化
- 問題カテゴリ精度の確認
- 画像参照の全件確認

## 13. 推奨する次の実装順

ユーザーから画面詳細が届くまでは、勝手に大幅なUI変更をしない。

推奨順:

1. 別PCのローカル環境を構築し、現在のVercel・Supabase接続を確認
2. 現在の4画面と練習フローを再テスト
3. Googleログインとユーザー自動作成を実装
4. 一問一答DB・API・ポイント処理を実装
5. 151問の投入方針をユーザーへ確認してDBへ反映
6. 模擬試験DB・API・画面
7. 称号・ランキング・プロフィール
8. 掲示板
9. 教師管理画面
10. 詳細UI資料に合わせた全画面調整

## 14. 別PCでの開始手順

```bash
git clone https://github.com/25j004wonghoutin-byte/kakomonkun.git
cd kakomonkun
git status
git log -1 --oneline
```

Git管理外の `.env` を用意し、`DATABASE_URL`を設定する。

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
http://localhost:3000/practice
```

問題元データを使う場合は、旧PCの次のフォルダを別PCへコピーする。

```text
C:\Users\WONGHOUTIN\Desktop\kakomon
```

コピー後は `KAKOMON_SOURCE_DIR` を新しい場所へ合わせる。

## 15. 元要件資料

旧PC上の要件資料:

```text
C:\Users\WONGHOUTIN\Desktop\AIkudou\codex_instructions_ai_dev\codex_instructions_ai_dev
```

ファイル:

- `00_README_Codex_Instruction.md`
- `01_ProjectPlan_Requirements_updated.md`
- `02_ScreenTransitions_List_Mockups.md`
- `03_DB_Priority1_Core_and_Questions.md`
- `04_DB_Priority2_Learning_Gamification.md`
- `05_DB_Priority3_Board_Admin.md`
- `06_ER_Diagram.md`
- `07_Codex_Implementation_BackendFirst.md`

これらも別PCへコピーするか、次チャットで再添付する。

## 16. 作業上の禁止・注意

- Supabaseの既存データをリセットしない。
- 適用済みマイグレーションを書き換えない。変更は新規マイグレーションで行う。
- `main`へ勝手にforce pushしない。
- 環境変数や接続文字列をGitへ追加しない。
- 画面からSupabase DBへ直接アクセスしない。Next.js APIとPrismaを通す。
- `SUPABASE_SERVICE_ROLE_KEY`をブラウザへ公開しない。
- 一問一答と過去問練習を同じ履歴として扱わない。
- 教師と管理者を別権限として複雑化しない。
- 日次・月次判定は `Asia/Tokyo` 基準。
- 新しい画面詳細が届いたら、その内容を簡易モックより優先する。

## 17. 次チャットへ貼る短い開始プロンプト

```text
GitHubのkakomonkunプロジェクトを別PCで続けます。
最初にリポジトリ直下のHANDOFF_NEXT_CHAT.mdとAGENTS.mdを最後まで読み、
git status、最新コミット、Supabaseの既存テーブルとマイグレーションを確認してください。
既存データやマイグレーションは削除・初期化しないでください。
確認後、現在の完成部分・未完成部分・次に進める作業を一度私に整理して確認し、
私の承認後に実装を開始してください。
```
