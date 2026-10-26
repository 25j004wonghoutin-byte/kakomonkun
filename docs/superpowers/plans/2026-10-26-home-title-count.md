# ホームの所持称号数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現在のホームの「これまでの学習」に、マイページと同じ基準の所持称号数を表示する。

**Architecture:** 既存の `/api/me` に有効な所持称号の件数を追加し、ホームの取得・再取得処理から表示する。API、通信状態、表示部品を小さく分離し、既存の日次問題とポイント更新を保持する。

**Tech Stack:** 既存のNext.js 16.2.9 / React / TypeScript / Prisma / Supabase PostgreSQL / node:test。追加依存なし。

**Spec:** `docs/superpowers/specs/2026-10-22-review-notebook-design.md`（2026-10-26書面承認済み。特に1・4・5・13・14節）。

## Global Constraints

- 「これまでの学習」の既存の定義リストへ「所持称号」を1行追加する。古い所持情報カードや余分な説明を復元しない。
- 初期付与・無料購入・ポイント購入のすべてを含む。装備中かどうかでは絞り込まない。
- 関連する称号が有効な `UserTitle` のみを数える。`UserTitleUnlock` は数えない。
- 読込前・取得失敗時は「— 個」とする。教師の `profile: null` を維持する。
- このAPIから称号付与・購入・資格判定は行わない。
- パッケージ追加・DB変更・本番変更・pushは行わない。実装は計画承認と進め方の選択後。
- 日本語・BOM・改行を保持する。既存ファイルは編集前後に検査し、新規文書・ソースはUTF-8、BOMなし、CRLFとする。

## Review Focus

1. 成功した通信Aより遅れて古い通信Bが戻る場合、最新の取得開始に対応する応答だけを表示する。Task A2の逆順応答テストで固定する。
2. 日次問題のポイント更新後も所持称号数を失わない。Task A2の更新後表示テストで固定する。
3. 取得失敗を実数0個と取り違えない。Task A2でエラー・再試行と0個の表示を区別する。
4. 教師・未認証の要求で所持称号の問い合わせや資格付与を行わない。Task A1で呼出回数0を検証する。
5. 購入後の戻る操作・画面復帰で古い件数が残らない。Task A2で復帰イベントと再取得を確認する。

---

## 作業場所・保護・検証環境

指定フォルダーと既存の専用ブランチ `codex/review-notebook` を継続使用する。開始前に作業ツリーの変更一覧と対象ファイルのバイトハッシュを記録する。`student-home.tsx`、共通UI、設定などには別作業の未コミット変更があるため、旧版への置換やファイル丸ごとのステージングは行わない。

各タスクのコミットは今回の差分だけが切り分けられる場合に限る。切り分けできない既存UIへの変更は作業ツリーに保ち、既存UI差分を含める承認を別途受けてから統合する。これは実装を省略する意味ではない。main反映・pushは別承認まで行わない。

単体テストの子プロセスから `KAKOMON_RUN_*`、`KAKOMON_MOCK_*`、`DATABASE_URL`、`DIRECT_URL`、`TEST_DATABASE_URL`、`TEST_DIRECT_URL`、本番・テストのSupabase秘密キーを除く。以下の単体コマンドはこの環境で実行する。開始時の全テスト結果を記録し、既存のUI改修に起因する失敗は勝手に修正しない。

型チェック・生成・ビルドは指定フォルダー外の検証スナップショットで行う。現行の作業ツリーを元に `src`、`public`、`prisma/schema.prisma`、`scripts`、`tests`、必要なルート設定・依存ロックをコピーする。`.git`、`.next`、`coverage`、`output`、秘密ファイルと古いPrisma生成物はコピーしない。依存は既存 `node_modules` を独立コピーし、そのコピー内でだけPrisma生成を行う。インストールや依存更新は不要。

スナップショット内で `node node_modules/prisma/build/index.js generate`、`node node_modules/next/dist/bin/next typegen`、`npm run typecheck`、対象ファイルへの `npm run lint -- <paths>`、`node scripts/build-mock-asset-manifest.mjs`、`node node_modules/next/dist/bin/next build` を実行する。ビルド時は秘密情報のない検証用設定と閉じたDB接続先を使い、DB書き込み・AI呼び出しを行わない。ブラウザー確認は既存の `scripts/test-environment.mjs` で接続先を検証した専用テスト環境だけを使う。

## ファイル構成

- `src/lib/me.ts`（新規）: 公開DTO、件数取得、依存注入可能な既存me APIの組立。
- `src/lib/me-client.ts`（新規）: 取得の競合・破棄・再試行を扱う小さな通信制御。
- `src/components/home-study-totals.tsx`（新規）: 既存の学習情報欄の表示だけを担当。
- `src/app/api/me/route.ts`、`src/app/student-home.tsx`（修正）: 上記との接続。既存UI・レスポンスを維持。
- `tests/home-title-count.test.mjs`、`tests/home-title-client.test.mjs`、`tests/home-title-render.test.mjs`（新規）: API・通信状態・実部品のSSR検証。

### Task A1: 本人の有効な所持称号数をme APIへ追加

**Files:** Create `src/lib/me.ts`, `tests/home-title-count.test.mjs`; Modify `src/app/api/me/route.ts`。

**Interfaces:**
- `MeActor`: `id`, `displayName`, `role: { name: string }`, `studentProfile`（`totalPoints/totalPracticeCount/totalCorrectCount/totalAnswerCount: number` と `avatarUrl: string | null`、またはnull）。
- `MePayload`: 現在の `id/displayName/role/profile` を維持し、学生profileだけへ `ownedTitleCount: number` を追加。
- `getOwnedTitleCount(db: Pick<PrismaClient, "userTitle">, userId: string): Promise<number>`。
- `createMeHandler(deps: { getUser(): Promise<MeActor | null>; countOwnedTitles(userId: string): Promise<number> }): () => Promise<Response>`。

- [ ] **Step 1: 失敗するテストを書く。** `counts only active ownership for the current user` はcountへの入力を記録し、次を検証する。
  ```js
  assert.equal(await getOwnedTitleCount(db, studentId), 4);
  assert.deepEqual(recordedWhere, {userId: studentId, title: {isActive: true}});
  ```
  `me preserves fields and adds owned count` で件数4と既存プロフィールを検証する。`anonymous and teacher do not count titles` では401／教師profile=null、count呼出0回を検証する。購入資格だけの行はfixtureの所有件数へ含めない。
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/home-title-count.test.mjs`。未実装のexportがないため失敗することを確認する。
- [ ] **Step 3: 最小実装。** 件数は `prisma.userTitle.count`、認証は現在の `getCurrentUser`、固定教師名は現在の `displayNameForRole` を使う。APIはfactoryへ接続し、`Cache-Control: private, no-store, max-age=0` と `Vary: Cookie` を維持する。学生profileがない場合はnullのまま。既存の認証を改変しない。
- [ ] **Step 4: GREEN確認。** 同じコマンドが失敗0になること、API追加項目以外を変えていないことを確認する。
- [ ] **Step 5: 今回の差分だけを確認してコミット。** `fix: return actual owned title count in student summary`。API以外の既存変更を含めない。

### Task A2: 最新ホームへの表示・復帰時の再取得

**Files:** Create `src/lib/me-client.ts`, `src/components/home-study-totals.tsx`, `tests/home-title-client.test.mjs`, `tests/home-title-render.test.mjs`; Modify `src/app/student-home.tsx`。

**Interfaces:**
- A1の `MePayload` を使用する。ホームのローカル `MeResponse` はこの型へ合わせる。
- `createMeLoader({fetchMe, onData, onError, onLoading})`。`fetchMe(signal: AbortSignal): Promise<MePayload>`、`onData(value: MePayload | null): void`、`onError(message: string): void`、`onLoading(value: boolean): void`。戻り値は `{load(): Promise<void>; dispose(): void}`。
- `mergeMePoints(current: MePayload | null, totalPoints: number): MePayload | null` をme-client.tsに置き、日次問題からの2箇所のポイント更新で共用する。profileがあるときだけtotalPointsを置換し、所持称号数を含む他項目は保持する。
- `HomeStudyTotals({profile, loading, error, onRetry})`。`profile: MePayload["profile"]`、残りはboolean／string／`() => void`。既存の4行を保持し、所持称号を1行追加する。

- [ ] **Step 1: 通信と表示の失敗テストを書く。** `latest started request wins` は保留Promiseを2個作り、新しい要求を先に解決してから古い要求を解決する。`dispose ignores late response` は解除後に通知がないことを検証する。
  ```js
  assert.equal(received.at(-1).profile.ownedTitleCount, 5);
  assert.equal(received.length, 1); // 古い応答は通知しない。
  ```
  `missing and failed counts are not zero` と `zero is a real count` でSSRに「— 個」と「0 個」をそれぞれ検証する。`daily points preserve owned count` は既存のポイント更新に同じプロフィールを渡し、ポイント10と件数4が共存することを検証する。
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/home-title-client.test.mjs tests/home-title-render.test.mjs`。未実装を理由に失敗することを確認する。
- [ ] **Step 3: 最小実装。** loaderで要求番号とAbortControllerを管理する。失敗時はonData(null)と安全なエラー、再試行で再取得、dispose後は通知なし。現在のホームへ接続し、初回・`pageshow`・表示状態がvisibleへ戻った時に取得する。リスナー解除と応答破棄を行い、定期ポーリングは追加しない。日次問題のポイント更新はmergeMePointsに接続し、テストもこの実関数と表示部品を使う。
- [ ] **Step 4: 表示とブラウザーを確認。** 既存の `study-totals` / `study-stat` と `dl/dt/dd` を再利用し、取得失敗の近くに「再試行」を置く。上記テストとA1、型チェック・lint・ビルドを実行する。専用テスト環境でmeの件数＝マイページの所持件数、戻る／復帰時の再取得、通信失敗→再試行、PC／375px表示を確認する。
- [ ] **Step 5: 日本語・BOM・改行と保護ファイルのハッシュを確認し、今回分だけコミット。** `fix: show owned titles in current home study totals`。既存UIと分離できないホームの差分は保持してコミットを保留し、統合前に確認する。

## 完了条件と次の計画

取得・表示・再試行・復帰・0件の区別が検証できて初めて修正済みと報告する。未実施のブラウザー確認やビルドは未検証とする。DB・本番への変更はない。

この修正は復習ノートに依存しない。次は `docs/superpowers/plans/2026-10-26-review-notebook.md` を実行する。両計画の書面確認と進め方の選択を受けるまで、実装へ進まない。
