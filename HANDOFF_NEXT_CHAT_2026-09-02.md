# kakomonkun 新環境・新しい対話への移行指示書

更新日: 2026-09-02
リポジトリ: `https://github.com/25j004wonghoutin-byte/kakomonkun`
ブランチ: `main`
GitHub反映済み最新コミット: `48d0b37 feat: add IPA official question archive`
アプリ名: **目指せ合格！過去問くん**

## 1. この文書を最優先すること

この文書は、別PC・別フォルダー・新しいCodex対話で開発を再開するための最新引継ぎ資料です。

最初に次の順で読んでください。

1. リポジトリ直下の `AGENTS.md`
2. この `HANDOFF_NEXT_CHAT_2026-09-02.md`
3. `IMPLEMENTATION_SUMMARY_2026-09-02.md`
4. 必要な範囲の `codex_instructions_ai_dev/`

`HANDOFF_MIGRATION_2026-07-13.md` と `PROJECT_STATUS_AND_PLAN.md` は古い状態を記録した履歴資料です。「一日一問未完成」「過去問本格投入前」など、現在とは異なる情報を含むため、実装判断ではこの文書を優先してください。

## 2. 新しい担当者が最初に行うこと

1. `git status --short`、現在ブランチ、最新コミットを確認する。
2. `AGENTS.md` のNext.js 16と文字コード規則を確認する。
3. `.env` をGit管理外で用意する。値をチャットやGitへ貼らない。
4. `npm ci` の前に、少なくとも `DIRECT_URL` を含む必要な環境変数を設定する。
5. `npm run typecheck`、`npm run lint`、`npm run build` を実行する。
6. Supabaseの既存DB・既存データ・適用済みマイグレーションを削除しない。
7. 実装へ入る前に、現状と次に行う作業をユーザーへ短く整理して確認する。

## 3. Git状態

GitHub上の基準状態:

```text
branch: main
HEAD: 48d0b37
origin/main: 48d0b37
```

主要コミット:

```text
48d0b37 feat: add IPA official question archive
7916dc6 feat: enhance profile and practice experience
76a2f45 fix: use transaction pooling for runtime database access
a198590 feat: expand practice and add student profile
acddb01 feat: add daily and random quiz modes
bd0b500 Fix student sessions and AI table security
33d2d09 0713_handoff
```

元PCの作業ツリーには、文書作成前の確認時点で次の未コミット物がありました。

- `prisma/generated/` 配下の改行コード差分。
- `scripts/__pycache__/`。
- `tmp/` 配下のPDF、OCR検証ファイル、仮想環境など。

`git diff --ignore-space-at-eol -- prisma/generated` は差分なしでした。つまりPrisma生成物は意味のあるコード変更ではなく、LFとCRLFの差として検出されています。これらを新環境へコピーしたり、理由なくコミットしたりしないでください。GitHubから新規cloneする場合は含まれません。

この2つの新規文書自体は、作成直後は未コミットです。新環境でGitHubから読むには、移行前に文書だけをcommit・pushする必要があります。

## 4. 新環境への取得手順

```bash
git clone https://github.com/25j004wonghoutin-byte/kakomonkun.git
cd kakomonkun
git branch --show-current
git log --oneline -7
git status --short
```

既にclone済みの場合:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

期待する最新コミットは `48d0b37` です。

## 5. 必要な環境変数

新環境ではGit管理外の `.env` を作成してください。実値は既存のVercelまたは元PCの安全な保管先から移します。

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

用途:

- `DATABASE_URL`: Next.js実行時に使用。Supabase Transaction modeの接続文字列。
- `DIRECT_URL`: Prisma CLIとマイグレーションに使用。直接接続またはSession modeの接続文字列。
- `NEXT_PUBLIC_SUPABASE_URL`: SupabaseプロジェクトURL。
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: ブラウザ用公開キー。
- `GEMINI_API_KEY`: AI解説生成に必要。
- `GEMINI_MODEL`: AIモデル名。現在の既定値は `gemini-3.5-flash`。

注意:

- 現在の `.env.example` には `DIRECT_URL` がまだ記載されていませんが、`prisma.config.ts` は `DIRECT_URL` を必須参照します。
- `npm ci` の `postinstall` で `prisma generate` が動くため、先に環境変数を設定してください。
- `DATABASE_URL` をSession modeへ戻すと、Vercelで `EMAXCONNSESSION` が再発する可能性があります。
- 接続文字列、パスワード、秘密鍵をGitまたは対話へ貼らないでください。

## 6. インストールと起動

環境変数設定後:

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
http://localhost:3000/random-quiz
http://localhost:3000/practice
http://localhost:3000/profile
http://localhost:3000/profile/learning
```

ローカル開発では `/login/teacher` から `test-student` の開発用ログインを利用できます。本番環境ではこのログインを有効にしません。

## 7. 現在の技術構成

- Next.js 16.2.9 App Router
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4
- Prisma 7.8
- `@prisma/adapter-pg`
- Supabase PostgreSQL
- Supabase Auth Google Provider
- Gemini API
- Vercel

主要スクリプト:

```text
npm run dev
npm run build
npm run lint
npm run typecheck
npm run seed:build
npx prisma generate
```

Next.js 16は既知のNext.jsとAPI・規約が異なる可能性があります。コード変更前に、必要な範囲の `node_modules/next/dist/docs/` を確認してください。

## 8. 現在実装済みの主要機能

### 8.1 認証

- Supabase Googleログイン。
- 初回ログイン時の `users` と `student_profiles` 作成。
- `/api/me` による現在ユーザー取得。
- 開発用 `test-student` ログイン。
- 開発用ログインのJSONエラー処理。
- ローディング中に既定名「学生」を誤表示しないヘッダー。
- 上部メニューとサイドバーからマイページへ移動。

### 8.2 一日一問

- `Asia/Tokyo` 日付基準で1日1問を固定。
- roleに依存せずログイン済みユーザーが回答可能。
- 回答履歴保存と二重回答防止。
- 学生は回答1pt、正解追加1pt。

### 8.3 ランダム出題

- `/random-quiz` で無制限に更新・回答可能。
- 正誤判定のみ。
- 履歴保存なし。
- ポイント付与なし。

### 8.4 過去問練習

- ITパスポートと基本情報技術者。
- 30問または60問。
- 分野選択は基本情報技術者だけ。
- 指定なしではテクノロジ、マネジメント、ストラテジを均等出題。
- 回答自動保存、再開、途中終了、結果表示。
- 30問完了5pt、60問完了15pt。
- 正解10問ごとに1ptボーナス。
- 基本完了ポイントは1日2回まで。
- 回答後の正誤アニメーション。
- AI解説。
- IPA公式画像問題表示。

### 8.5 マイページ

- `/profile` のプロフィール・学習概要。
- 表示名と自己紹介の編集。
- ポイント、回答数、練習数、正答率。
- 総合・今月切替。
- 分野別正答率。
- 最近の学習。
- ポイント履歴。
- 所持称号表示と装備変更。
- `/profile/learning` の学習状況詳細、フィルター、履歴、ページネーション。

### 8.6 AI解説とRLS

- GeminiでAI解説を生成。
- `ai_explanations` にキャッシュ。
- `ai_usage_logs` に利用記録。
- 両テーブルはRLS有効、クライアント向けポリシーなし。
- アプリはNext.js APIとPrisma経由でアクセスするため、既存キャッシュを読み込める。

## 9. 問題データの現状

`supabase/generated-question-seed.json` の現在件数:

- ITパスポート: 631問
- 基本情報技術者: 2,000問
- 合計: 2,631問

IPA公式ITパスポート公開問題:

- 2021年から2026年。
- 各年度100問。
- 合計600問。
- 選択肢2,400件。
- Supabaseへ投入済みであることを実装時に確認。
- 原題画像600枚を `public/kakomon/img/ipa/` にGit管理。
- 公式問題はOCR文字ではなく画像表示。

新環境で通常開発を再開するだけなら、公式600問を再投入しないでください。DB内容を確認し、欠落がある場合だけ `scripts/upsert-question-seed.mjs` の使い方と影響範囲を確認してから実行します。

## 10. 重要なUI・仕様決定

- マイページの「Googleアカウントの画像と連携」という説明文は不要。
- `P`、`回`、`問`、`%`、`練` などの文字アイコンは使わない。
- ユーザー本人を表す人物アイコンは残す。
- 試験カードの `EXAM` 表記は表示しない。
- 過去問練習画面下の機能説明3項目は表示しない。
- IPA公式600問は画像表示を維持する。
- ランダム出題はポイントなし。
- 一日一問は日付固定。
- 過去問練習は当面30問と60問のみ。
- 年度・季節フィルターと出題モードは未実装のまま。
- 分野選択は基本情報技術者だけ。
- 正解数ボーナスは削除しない。

## 11. 現在未実装・未完成

優先して検討するもの:

1. 称号ショップ画面 `/titles`。
2. ポイントを使った称号購入。
3. 称号獲得条件と自動付与。
4. 間違えた問題の復習。
5. マイページ・学習状況の追加実データ検証。
6. Vercel本番で最新画像問題、認証、ポイントを通した動作確認。
7. `.env.example` への `DIRECT_URL` 追記。

優先度を下げるもの:

- 模擬試験。
- 月間ランキング。

その他未実装:

- 教師ダッシュボード。
- 本格的な教師共通アカウント認証。
- 掲示板。
- お知らせ・通知。
- 問題登録・編集画面。
- 称号マスタ管理。

## 12. 推奨する次の実装順

1. 新環境でtypecheck、lint、buildを通す。
2. Googleログインと `test-student` ログインを確認。
3. 一日一問、ランダム出題、30問練習の主要導線を確認。
4. IPA公式画像問題がローカルとVercelで表示されることを確認。
5. マイページと学習状況詳細を実データで確認。
6. 称号ショップの画面・購入ルール・DB更新方法をユーザーと相談。
7. 合意後に称号ショップと購入APIを実装。
8. 次に復習機能を設計。

## 13. 移行後の手動確認項目

- ログイン前に保護ページへ入ると `/login` へ移動する。
- Googleログイン後に正しい表示名が右上へ出る。
- ローディング中に「学生」が一瞬表示されない。
- `test-student` ログインがJSONエラーにならない。
- 一日一問が同じ日に変化しない。
- 一日一問の二重回答でポイントが増えない。
- ランダム出題を更新してもポイントが増えない。
- 基本情報技術者だけ分野選択が表示される。
- 30問・60問を開始できる。
- 中断後に続きから再開できる。
- 途中終了時に完了ポイントが付かない。
- 30問完了で5pt、60問完了で15pt。
- 正解10問ごとのボーナスが加算される。
- IPA公式問題が画像で表示される。
- 画像問題でOCR本文やプレースホルダー選択肢が二重表示されない。
- マイページの集計と練習結果が一致する。
- 表示名・自己紹介を編集できる。
- 所持称号を装備変更できる。
- AI解説の既存キャッシュと新規生成が動作する。

## 14. 禁止・注意事項

- Supabase DBをリセットしない。
- 既存問題、回答履歴、ポイント履歴を削除しない。
- 適用済みマイグレーションを書き換えない。
- `.env` や秘密情報をコミットしない。
- `DATABASE_URL` をSession modeへ戻さない。
- `DIRECT_URL` と `DATABASE_URL` の用途を入れ替えない。
- `main` へforce pushしない。
- ユーザーの既存未コミット変更を勝手に破棄しない。
- パッケージ追加・削除は事前確認する。
- 大きなDB設計変更、認証仕様変更、権限仕様変更は事前確認する。
- UI全体を大きく変更する場合は、先にプレビューまたは方針確認を行う。
- 文字化けが疑われるファイルを、そのまま保存しない。

## 15. 文字コード規則

既存の日本語ファイルは編集前に次を確認します。

- エンコーディング。
- BOM有無。
- 改行コード。

編集後は代表的な日本語行を再読込し、次がないことを確認します。

- 置換文字。
- 予期しない `?`。
- 意図しないBOM変更。
- 意図しない改行変換。
- 理由のない全体差分。

この文書と `IMPLEMENTATION_SUMMARY_2026-09-02.md` は、UTF-8、BOMなし、CRLFで作成します。

## 16. 新しい対話へ貼る開始文

次の文章を、新しい対話の最初に貼ってください。

```text
kakomonkunプロジェクトを別環境で続けます。
最初にリポジトリ直下のAGENTS.md、HANDOFF_NEXT_CHAT_2026-09-02.md、IMPLEMENTATION_SUMMARY_2026-09-02.mdを最後まで読んでください。
次にgit status、現在ブランチ、最新コミット、package.json、prisma.config.ts、src/lib/prisma.ts、prisma/schema.prismaを確認してください。
基準コミットはmainの48d0b37です。
DATABASE_URLはアプリ実行用のTransaction mode、DIRECT_URLはPrisma CLI用です。Supabaseの既存DB・既存データ・適用済みマイグレーションを削除または初期化しないでください。
現在は一日一問、ランダム出題、30問・60問の過去問練習、ポイント、マイページ、学習状況詳細、称号装備、回答アニメーション、IPA公式ITパスポート600問の画像表示まで実装済みです。
模擬試験と月間ランキングの優先度は低く、次は称号ショップ・称号購入と過去問復習機能を優先して相談します。
すぐに実装へ入らず、まず現状、未完成部分、次に行う作業案を日本語で短く整理して確認してください。
```
