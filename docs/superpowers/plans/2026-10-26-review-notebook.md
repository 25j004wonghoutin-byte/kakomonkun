# 復習ノート初期版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 導入後の過去問練習の誤答だけを本人の復習ノートへ自動保存し、報酬・通常成績を変えずに解き直せるようにする。

**Architecture:** 通常解答のトランザクションから専用の復習項目を登録し、解き直しは専用の結果表とrevisionで重複・古い更新を防ぐ。小さなサーバーサービス、依存注入可能なAPI、一覧と1問の画面に分ける。既存の問題表示と最新のUI部品を使い、本番適用は計画実行に含めない。

**Tech Stack:** 既存のNext.js 16.2.9 / React / TypeScript / Prisma / Supabase PostgreSQL / node:test。追加依存なし。

**Spec:** `docs/superpowers/specs/2026-10-22-review-notebook-design.md`（2026-10-26書面承認済み。2・6〜14節）。ホーム修正は独立した `2026-10-26-home-title-count.md`。

## Global Constraints

- 対象は過去問練習のみ。ランダム出題・今日の一問一答・模擬試験は対象外。
- 既存の解答履歴は取り込まない。正解問題の手動登録、自由メモ、手動の復習済み切替、ノート削除は初期版に含めない。
- 状態は `unreviewed`（未復習）、`reviewing`（復習中）、`reviewed`（復習済み）。通常練習の再誤答で未復習へ戻す。
- 解き直しは報酬や通常成績と切り離し、ノート内の進捗だけを更新する。
- 学生メニューは「過去問練習 → 復習ノート → 模擬試験」の順にする。教師メニューには追加しない。
- 一覧は「未完了／復習済み／すべて」、初期表示は未完了。試験・分野で絞り込み、1ページ10件表示。
- 回答保存後に正解・解説を表示する。AI解説APIは呼ばない。
- 新規2テーブル・関連する外部キー・索引・RLSの追加に限定し、既存表・既存データを破壊しない。
- 専用テストDB `grzylombpqmidltnbwhx` で先に検証する。本番DBへの適用・pushはそれぞれ別途確認する。
- 不要な英語ラベル・飾り・自明な案内文を追加しない。必要な条件・復旧方法・アクセシビリティは残す。
- 既存UIの未コミット変更、問題JSON、Prisma生成物、秘密ファイルを保持する。文字コード・BOM・改行を保ち、日本語を再読込する。

## Review Focus

1. 成功応答を失った後に通常練習で再誤答し、古い要求を再送しても、新しい未復習状態を上書きしない。Task B3・B8。
2. 所有者が違うsessionIdや項目ID、ログアウト後の遅延応答で、前の学生の問題を表示しない。Task B4・B5・B6。
3. 正解選択肢が0個／複数ある壊れた問題は採点成功にせず、復習状況と履歴を保存しない。Task B3。
4. 画像だけの問題、長い日本語・出典、狭い画面でも一覧に識別情報が残り、問題がはみ出さない。Task B5・B6・B8。
5. 同名テーブルがあるのに移行履歴がない／履歴とSQLが異なる場合、既存物を置換せず停止する。Task B1。

---

## 実行前の保護と検証方法

指定フォルダーの `codex/review-notebook` を継続する。開始時に未コミット差分とバイトハッシュを保存する。`student-shell.tsx`、練習結果画面、共通UI、設定には別作業の変更がある。変更前の内容で上書きせず、実装差分だけを確認する。コミットに既存UI差分が混ざり切り分けられない場合は、そのファイルを作業ツリーに保ったまま統合承認を求める。`git add .` や生成物の一括追加は禁止する。

既存単体テストの基準結果を実装前に記録する。単体コマンドは子プロセス環境から `KAKOMON_RUN_*`、`KAKOMON_MOCK_*`、本番・テストのDB URLとSupabase秘密キーを除いて実行する。以降の単体Runはこの条件を共通前提とする。実DBテストはB8でのみ明示的に有効化し、skipを実施済み扱いにしない。

生成・型チェック・ビルド・ローカルサーバーは、visualizations側の新規検証フォルダーに作る現行作業ツリーのスナップショットで行う。`src`、`public`（現在の追加画像部品・フォントを含む）、schema、scripts、tests、必要なルート設定と依存ロックをコピーし、`.git`、`.next`、`coverage`、`output`、秘密ファイル、古い生成物を除く。既存node_modulesの独立コピーを使い、そこでだけPrisma Clientを生成する。テスト起動には `.env.test.local` だけを明示的に置き、`loadTestConfig()` で検証し、本番用envへのフォールバックをしない。生成物を元の作業フォルダーへ戻さない。

実装前に、該当するローカルNext.js資料（Route Handlers、Server/Client Components、params、useSearchParams、CSS）を `node_modules/next/dist/docs/` で読む。画面は現在の `DESIGN.md` と既存UIに合わせる。新しいデザイン方向の再提案・依存追加は行わない。

## ファイル責務と共有インターフェース

- `src/lib/review-notebook/contract.ts`: 公開DTO、Actor、入力型、`ReviewNotebookError(code, status, message)`。ブラウザーで安全にimportできる型と定数だけ。
- `rules.ts` / `request.ts` / `version.ts`: 状態遷移、厳密な入力・URL変換、サーバー専用の問題版生成。
- `write.ts` / `read.ts`: Prisma経由の保存と読取。既存の称号処理へ責務を混在させない。
- `handlers.ts` / `server.ts`: HTTP認証・安全な応答と、既存auth/Prismaの接続。
- `list-loader.ts` / `answer-controller.ts`: 古い取得応答の破棄と、同じ要求での回答再試行。
- `src/app/review-notebook/`: 認証付きページ、通信を扱うclient、表示だけのview、名前空間付きCSS。CSSはlayoutでimportし、SSRテスト対象のviewからはimportしない。
- 下記各タスクが具体的な作成・修正パスとテストを所有する。

`contract.ts` に以下を定義する。日時は公開DTOではISO文字列、DBサービスの引数ではDate。

```ts
type ReviewStatus = "unreviewed" | "reviewing" | "reviewed";
type ReviewActor = {id: string; roleName: string; status: string; deletedAt: Date | null};
type ReviewQuery = {status: "unfinished" | "reviewed" | "all"; examCode: string | null;
  categoryCode: string | null; page: number; sessionId: string | null};
type ReviewListItem = {id: string; status: ReviewStatus; firstWrongAt: string; lastWrongAt: string;
  lastReviewedAt: string | null; exam: {code: string; name: string};
  category: {code: string; name: string}; sourceLabel: string | null; questionPreview: string};
type ReviewList = {query: ReviewQuery; items: ReviewListItem[]; total: number; pageCount: number; pageSize: 10};
type ReviewDetail = {id: string; status: ReviewStatus; revision: number; questionVersion: string;
  lastWrongAt: string; lastReviewedAt: string | null; question: QuizQuestion};
type ReviewAnswerInput = {requestId: string; expectedRevision: number;
  questionVersion: string; selectedChoiceId: string};
type ReviewAnswerResult = {item: {id: string; status: ReviewStatus; revision: number; lastReviewedAt: string};
  answer: QuizAnswerResult & {selectedChoiceId: string; answeredAt: string}; replayed: boolean};
```

`QuizQuestion` / `QuizAnswerResult` は既存の `src/components/quiz-question-card.tsx` の型をtype importで参照する。選択肢は公開DTOで `{id,label,text}` に変換し、DBの `choiceLabel/choiceText` をそのまま返さない。本文と画像・出典は既存の `getQuestionPresentation` を使う。`ReviewNotebookError.status` は400/401/403/404/409/500。

### Task B1: 追加2テーブルと安全なテスト用移行手段

**Files:** Modify `prisma/schema.prisma`; Create `supabase/migrations/20261026000000_review_notebook.sql`, `scripts/lib/review-notebook-migration.mjs`, `scripts/apply-test-review-notebook-migration.mjs`, `tests/review-notebook-schema.test.mjs`, `tests/review-notebook-migration.test.mjs`。

**Interfaces:** `applyReviewNotebookMigration(db, sql): Promise<{alreadyApplied: boolean}>`。CLIは `loadTestConfig()` のDIRECT_URLだけを使う。移行versionは `20261026000000`、nameは `review_notebook`。

- [ ] **Step 1: schemaと移行の失敗テストを書く。** spec7節の2モデル、項目の `userId_questionId` と `id_userId`、結果の `userId_requestId` と `itemId_expectedRevision`、FK・索引・CHECK・RLSを検証する。`migration refuses unrecorded existing tables` と `migration refuses SQL drift` を追加する。
  ```js
  await assert.rejects(applyReviewNotebookMigration(dbWithExistingTable, sql));
  assert.equal(executedDdl.length, 0);
  assert.equal((await applyReviewNotebookMigration(dbWithSameHistory, sql)).alreadyApplied, true);
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-schema.test.mjs tests/review-notebook-migration.test.mjs`。不足するファイル／制約を理由に失敗させる。
- [ ] **Step 3: schema・SQL・適用helperを実装する。** 項目はUUID主キー、status文字列CHECK、revision Int既定0かつ非負、各日時Timestamptz(3)。結果は `[userId,requestId]` 主キー、expectedRevision非負、questionVersionは64文字、resultはJSONB。所有者込みの項目FK、選択肢FKを付け、User/Question/QuestionChoiceへ必要なPrisma逆参照を追加する。User/項目の削除はCascade、参照中のQuestion/ChoiceはRestrict。索引には安定ソートのidを末尾に含める。匿名・ブラウザー認証ロールの直接権限を拒否する。
- [ ] **Step 4: 移行を安全化する。** SQLに既存表の削除・書換え、履歴取込、BEGIN/COMMITを含めない。helperはPrisma transaction内でadvisory lock、5秒lock timeout・30秒statement timeout、履歴SQL照合を行い、履歴なしの同名テーブルを拒否する。同一履歴でも2表・必須制約・RLSの存在を確認し、ずれがあれば自動修復せず停止する。初回だけDDLと履歴を同時保存する。秘密値やDBエラー本文を出力しない。
- [ ] **Step 5: GREEN・生成確認。** 上記テスト、検証コピーでPrisma validate/generateを実行する。ここでは実DBへ適用しない。B8でSQLの対象と承認を確認してから適用する。
- [ ] **Step 6: 今回のschema・SQL・helper・テストだけコミット。** `feat: define isolated review notebook storage`。既存の `prisma/generated` の変更は含めない。

### Task B2: DTO・状態・入力・問題版を固定

**Files:** Create `src/lib/review-notebook/contract.ts`, `rules.ts`, `request.ts`, `version.ts`; Create `tests/review-notebook-rules.test.mjs`, `tests/review-notebook-request.test.mjs`。

**Interfaces:** `nextReviewStatus(isCorrect: boolean): ReviewStatus`; `parseReviewQuery(params: URLSearchParams): ReviewQuery`; `parseReviewAnswer(value: unknown): ReviewAnswerInput`; `buildReviewListHref(query: ReviewQuery): string`; `buildReviewItemHref(itemId: string, query: ReviewQuery): string`; `questionVersionOf(value: {id: string; updatedAt: Date; choices: Array<{id: string; updatedAt: Date}>}): string`。

- [ ] **Step 1: 失敗テストを書く。** 正解／不正解の状態、クエリ省略時の未完了・全試験・全分野・1ページ、0／負数／unsafe page、未知コード、重複パラメータ、不正UUID、余計なbody項目を検証する。categoryの `all` はnullへ正規化し、URL生成時の全試験・全分野はパラメータを省略する。
  ```js
  assert.equal(nextReviewStatus(true), "reviewed");
  assert.equal(nextReviewStatus(false), "reviewing");
  assert.equal(parseReviewQuery(new URLSearchParams()).page, 1);
  assert.throws(() => parseReviewAnswer({...validInput, userId: otherUserId}));
  assert.equal(questionVersionOf(problem), questionVersionOf({...problem, choices: [...problem.choices].reverse()}));
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-rules.test.mjs tests/review-notebook-request.test.mjs`。
- [ ] **Step 3: 実装する。** 上記DTOと定数pageSize=10を定義する。試験は `it_passport/fe`、分野は既存 `PRACTICE_CATEGORIES`。UUIDとrevision（0〜2147483647）、64文字の小文字hex版を検証し、クライアント由来の正誤・status・所有者は受け付けない。版は問題のID・更新日時とID順に整列した全選択肢のID・更新日時のcanonical JSONをSHA-256化し、正解フラグ・解説は使わない。node:cryptoを使うversion.tsをclientへimportしない。
- [ ] **Step 4: GREEN確認。** 同じテストに、選択肢だけの更新・日時の不正値・安全な内部URL生成・sessionId保持の検証を加えて失敗0とする。
- [ ] **Step 5: 今回分をコミット。** `feat: define review notebook rules and request contracts`。

### Task B3: 原子的な保存と通常練習の誤答連携

**Files:** Create `src/lib/review-notebook/write.ts`, `tests/helpers/review-notebook-memory.mjs`, `tests/review-notebook-write.test.mjs`, `tests/review-notebook-practice.test.mjs`; Modify `src/lib/titles/learning-events.ts`, `tests/helpers/learning-memory.mjs`。

**Interfaces:**
- `recordWrongPracticeAnswer(tx: Prisma.TransactionClient, input: {userId: string; questionId: string; answeredAt: Date}): Promise<void>`。呼出元が既存の所有者ロックを取得済みで、新規の学生誤答だけに呼ぶ。
- `saveReviewAnswer(tx: Prisma.TransactionClient, actor: ReviewActor, itemId: string, input: ReviewAnswerInput, now: Date): Promise<ReviewAnswerResult>`。
- テストhelperの `makeLearningMemory(overrides)` は既存の1引数利用を維持し、空の `reviewItems/reviewAnswers` と2delegateを追加する。従来テストの不正解経路も実際の登録先を持つようにする。`makeReviewMemory(overrides)` はこれを呼び、版生成に必要な日時・問題データ・失敗注入を用意する。メモリー直列化はPostgreSQLのロック検証の代わりにしない。

- [ ] **Step 1: 失敗テストを書く。** 新規誤答で項目1件・revision=1、再誤答で同じ項目を未復習・revision+1、正解／旧履歴閲覧／教師／重複通常解答では変化なし。ノート保存失敗で通常解答・集計・活動もロールバックされることを確認する。
  ```js
  assert.equal(db.state.reviewItems.length, 1);
  assert.equal(db.state.reviewItems[0].status, "unreviewed");
  assert.deepEqual(afterReviewRewardState, beforeReviewRewardState);
  assert.equal(retried.replayed, true);
  assert.equal(db.state.reviewAnswers.length, 1);
  ```
  `lost response then new practice mistake then replay`、`different request IDs for one revision`、`invalid correct-choice configuration rolls back`、`failure after item update rolls back receipt and item` を独立したテストにする。
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-write.test.mjs tests/review-notebook-practice.test.mjs`。
- [ ] **Step 3: 保存を実装する。** 初回はfirstWrongAt/lastWrongAtを設定しrevision=1、更新はlastWrongAt/statusとrevisionのみを変更し、過去のlastReviewedAtを残す。通常練習では新規PracticeAnswer作成後に同じtransactionで `isStudent && !choice.isCorrect` の場合だけ呼び、既存409の再送拒否と完了報酬を維持する。
- [ ] **Step 4: 解き直しを実装する。** actorの有効学生を確認し、既存の `lockTitleOwner` →項目の順でロックする。本人・公開状態を確認後、同じrequestIdの入力照合が一致すれば保存済みresultへreplayed=trueを付けて返す。新規はrevisionと問題版を照合し、正解がちょうど1個あることと選択肢の所属を検証する。問題・選択肢は短い共有ロックで確認時から保存まで編集を防ぐ。状態・revision+1・最終復習日時・結果を一緒に保存し、他の成績・報酬表には書かない。競合は409、壊れた採点設定は安全な500として全体を戻す。
- [ ] **Step 5: GREEN・既存回帰確認。** 上記テストと `tests/title-answer-events.test.mjs`、`tests/title-rules.test.mjs` を実行する。再送resultは過去のrevisionでも現在の項目へ再適用されず、通常練習の正解で復習済みにしないことを確認する。
- [ ] **Step 6: 今回分をコミット。** `feat: record and retry review answers without learning rewards`。

### Task B4: 本人限定の読取とHTTP API

**Files:** Create `src/lib/review-notebook/read.ts`, `handlers.ts`, `server.ts`; Create `src/app/api/review-notebook/route.ts`, `[itemId]/route.ts`, `[itemId]/answers/route.ts`; Create `tests/review-notebook-read.test.mjs`, `tests/review-notebook-api.test.mjs`; 必要な読取delegateを `tests/helpers/learning-memory.mjs` に追加する。

**Interfaces:** `readReviewList(db: PrismaClient, userId: string, query: ReviewQuery): Promise<ReviewList>`; `readReviewItem(db: PrismaClient, userId: string, itemId: string): Promise<ReviewDetail>`; `countPracticeReviewItems(db: PrismaClient, userId: string, sessionId: string): Promise<number>`。

`createReviewNotebookHandlers({getUser,service})` のgetUserは `Promise<ReviewActor | null>`、serviceは `{list(userId,query), item(userId,itemId), answer(actor,itemId,input)}`。戻り値は `list(request)`、`item(request,{itemId})`、`answer(request,{itemId})` のPromise<Response>。server.tsが既存getCurrentUserからActorを投影し、Prismaと30秒の保存transactionを接続する。

- [ ] **Step 1: 失敗テストを書く。** 0/10/11件、状態・試験・分野・セッションの積集合、同時刻の安定順、ページ超過補正、他人・旧履歴・非公開・削除済みの除外を検証する。APIは未認証401、教師403、不正入力400、他人対象404、競合409、安全な500、全応答no-storeを検証する。
  ```js
  assert.equal(page.pageSize, 10);
  assert.equal(page.items.length, 10);
  assert.equal(page.pageCount, 2);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(JSON.stringify(detail).includes("correctChoice"), false);
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-read.test.mjs tests/review-notebook-api.test.mjs`。
- [ ] **Step 3: 読取を実装する。** listはRepeatableReadの読取transaction内で所有セッション検証→count→補正page→findManyを順にawaitし、最終誤答日時desc/id asc、10件だけを返す。pageCountは最低1。previewは最大120 Unicode文字、画像問題の空本文は「画像問題」とする。itemは必要な公開データだけをDTOへ変換する。session絞り込みは本人の不正解と登録済み項目の積集合で、未登録行は作らない。
- [ ] **Step 4: HTTPを接続する。** 認証と学生ロールを入力処理より先に確認し、所有者はbody/queryから受け取らない。GETで状態を変えず、POSTだけがB3を呼ぶ。全応答は `private, no-store, max-age=0` / `Vary: Cookie`、未知の例外・Prismaの内部情報は返さない。Nextのparamsはawaitしてからfactoryへ渡す。
- [ ] **Step 5: GREEN確認。** 同じテストとB2/B3を実行する。401の場合にbodyを消費せずサービスを呼ばないこと、他人sessionIdで候補問題が漏れないことも確認する。
- [ ] **Step 6: 今回分をコミット。** `feat: expose private review notebook APIs`。

### Task B5: 一覧と学生メニュー

**Files:** Create `src/app/review-notebook/layout.tsx`, `review-notebook.css`, `page.tsx`, `review-notebook-client.tsx`, `review-notebook-view.tsx`, `src/lib/review-notebook/list-loader.ts`; Modify `src/components/student-shell.tsx`; Create `tests/review-notebook-list-render.test.mjs`, `tests/review-notebook-list-client.test.mjs`, `tests/review-notebook-navigation.test.mjs`。

**Interfaces:** `ReviewNotebookListView({data,query,loading,error,onQueryChange,onRetry})` はB2/B4のDTOを表示し、query変更は `ReviewQuery` を渡す。`createReviewListLoader({fetchList,onData,onError,onLoading})` は `load(query: ReviewQuery): Promise<void>` と `dispose(): void` を返す。fetchListは `(query,signal: AbortSignal) => Promise<ReviewList>`、onDataは `(data: ReviewList | null) => void`、onErrorは `(error: {status: number; message: string} | null) => void`、onLoadingは `(loading: boolean) => void`。ネットワークエラーのstatusは0とする。

- [ ] **Step 1: 失敗テストを書く。** `renders ten rows and all filters`、`empty and failure are distinct`、`image-only and long Japanese rows remain identifiable`、`older filter response is ignored`、`401 clears previous student data` を用意する。navの実HTMLで過去問練習→復習ノート→模擬試験、詳細URLでも選択中になることを検証する。
  ```js
  assert.equal((html.match(/data-review-item=/g) ?? []).length, 10);
  assert.ok(html.indexOf("過去問練習") < html.indexOf("復習ノート"));
  assert.ok(html.indexOf("復習ノート") < html.indexOf("模擬試験"));
  assert.match(emptyHtml, /過去問練習で間違えた問題がここに保存されます/);
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-list-render.test.mjs tests/review-notebook-list-client.test.mjs tests/review-notebook-navigation.test.mjs`。
- [ ] **Step 3: 一覧を実装する。** server pageは既存認証を使い未認証を/login、教師を/teacherへ送る。StudentShell内のSuspenseでclientを囲み、URLの検索条件を唯一の状態源とする。タブ・試験・分野変更でpage=1、詳細リンクにも同じ条件を付ける。補正されたpageをURLへreplaceし、戻る操作でも復元する。loaderは要求世代・abort・disposeを扱い、401で以前のdataを消してログインを案内する。
- [ ] **Step 4: 現在のUIへ合わせる。** layoutだけから名前空間付きCSSをimportする。現在の `--text/--muted/--surface/--border/--accent` と既存の見出し・操作部品を使い、余分な英語ラベルや装飾バッジを足さない。状態は文字で表示、タブとページに選択状態を付ける。モバイル44px以上の操作領域、長文の折返し、空状態と再試行を実装する。教師メニューと他の順序は変えない。
- [ ] **Step 5: GREEN確認。** 同じテスト、型チェックを行う。新しいCSSをSSRテストのviewからimportしないことで、既存のNode test loaderを拡張せずに実部品を検証する。
- [ ] **Step 6: 今回分だけコミット。** `feat: add paged student review notebook`。student-shellの既存差分が分離できなければ保持して統合承認を待つ。

### Task B6: 1問の解き直しと安全な再試行

**Files:** Create `src/app/review-notebook/[itemId]/page.tsx`, `review-question-client.tsx`, `review-question-view.tsx`, `src/lib/review-notebook/answer-controller.ts`; Create `tests/review-notebook-question-render.test.mjs`, `tests/review-notebook-answer-client.test.mjs`。

**Interfaces:** `ReviewQuestionView({detail,selectedChoiceId,result,saving,error,requiresReload,requiresLogin,unavailable,onSelect,onSubmit,onRetry,onReload,onReset,backHref})`。detail/resultはB2の型またはnull、各操作はcallback、状態flagはboolean、error/backHrefはstring。`createReviewAnswerController({detail,send,newId,onState})` は `submit(choiceId: string): Promise<void>`、`retry(): Promise<void>`、`reset(detail: ReviewDetail): void`、`dispose(): void` を返す。sendは `(itemId: string,input: ReviewAnswerInput) => Promise<ReviewAnswerResult>`、newIdは `() => string`、onStateは `{pending: ReviewAnswerInput | null; result: ReviewAnswerResult | null; saving: boolean; error: string; requiresReload: boolean; requiresLogin: boolean; unavailable: boolean}` を通知する。HTTP失敗はstatus付きのErrorをtransport側で作る。

- [ ] **Step 1: 失敗テストを書く。** `network retry preserves exact input`、`new attempt gets new request ID`、`409 requires reload without automatic resubmit`、`401 clears private result`、`dispose ignores late result` を用意する。表示テストでは回答前の正解・解説の非表示と、成功後の正誤・未登録解説・画像・出典を確認する。
  ```js
  assert.deepEqual(sent[1], sent[0]); // 通信再試行は同じrequestIdと選択肢。
  assert.notEqual(nextAttempt.requestId, sent[0].requestId);
  assert.doesNotMatch(beforeAnswerHtml, /正解：|検証用の解説/);
  assert.match(afterAnswerHtml, /解説は未登録です/);
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-question-render.test.mjs tests/review-notebook-answer-client.test.mjs`。
- [ ] **Step 3: controllerを実装する。** 初回submit時だけdetailからexpectedRevision/questionVersionを固定してrequestIdを作る。通信／500の再試行は同じ入力、送信中の二重操作は無視する。409では旧入力を自動再送せず再取得を求める。401/404では問題と前の結果を隠し、reset/disposeで古い応答を捨てる。同じ問題の新規試行では最新detailを取得してから新IDを作る。
- [ ] **Step 4: 画面を接続する。** server pageで認証とawait paramsを扱い、検索条件を読むclientをSuspenseで囲む。clientが本人detailを取得し、既存QuizQuestionCardへ公開DTOを渡し、保存成功後だけanswerを表示する。「復習はポイントや通常の成績に加算されません。」を操作の近くに置き、結果は「一覧へ戻る」「もう一度解く」、競合は「再読み込み」、通信失敗は「再試行」で復旧する。保存後の再取得では現在の状態・revisionだけを反映し、回答結果は表示し続ける。controller.resetはユーザーが新しい試行を始めるときに行い、古い再送resultのrevisionを現在値へ上書きしない。画像・選択肢・出典は現行部品を維持し、AIボタンを追加しない。
- [ ] **Step 5: GREEN確認。** 同じテストとB3/B4を実行する。F5後に復習状態が残り、解き直し自体は新しい試行として開始できることも確認する。
- [ ] **Step 6: 今回分をコミット。** `feat: add single-question review and idempotent retry controls`。

### Task B7: 今回の練習から復習へつなぐ

**Files:** Modify `src/app/api/practice/sessions/[sessionId]/route.ts`, `src/app/practice/[sessionId]/result/page.tsx`; Create `src/components/practice-review-link.tsx`, `tests/review-notebook-practice-link.test.mjs`。

**Interfaces:** B4の `countPracticeReviewItems` を使用。既存セッションGETへ `reviewNotebookCount: number | null` を追加し、本人学生にだけ件数、教師にはnullを返す。`PracticeReviewLink({sessionId, reviewNotebookCount})` は正の件数だけ内部リンクを表示する。

- [ ] **Step 1: 失敗テストを書く。** `session link includes all registered wrong items`、`no link for zero or teacher`、`old result view cannot backfill items` を追加する。
  ```js
  assert.match(html, /今回間違えた問題を復習/);
  assert.match(html, /status=all/);
  assert.ok(html.includes(sessionId));
  assert.equal(renderToStaticMarkup(React.createElement(PracticeReviewLink, {sessionId, reviewNotebookCount: 0})), "");
  ```
- [ ] **Step 2: RED確認。** `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-practice-link.test.mjs`。
- [ ] **Step 3: 接続する。** 既存GETの本人・教師の閲覧権限と問題DTOを変えず、本人学生だけに件数を追加する。旧結果・非公開問題・未登録問題は新規作成しない。結果画面へ部品を追加し、`status=all&sessionId=...` の一覧へ移動する。URLはB2のbuilderを使用。clientの古いsession応答を破棄し、元の結果・ポイント表示・操作を保持する。
- [ ] **Step 4: GREEN確認。** 同じテストとB4のセッション所有権・積集合テストを実行する。実HTTPでのGET件数はB8でも確認する。
- [ ] **Step 5: 今回分をコミット。** `feat: link practice mistakes to scoped review notebook`。既存結果画面の別作業差分は勝手に含めない。

### Task B8: 専用DB・実ブラウザー・全体回帰の最終確認

**Files:** Create `tests/helpers/review-notebook-db.mjs`, `tests/review-notebook-database.integration.test.mjs`; 検証報告・スクリーンショットはvisualizations側の今回用フォルダーに保存する。必要なら計画の実施チェックだけ更新する。

**Interfaces:** `withReviewDb(run)` は `{db, other, actor, otherActor, runId, questionIds, sessionIds, now}` を渡す。2個の独立したPrisma接続を使い、`loadTestConfig()` 検証済みのDIRECT_URLに限定する。自動DB検証のユーザー・問題・練習はすべて今回のUUIDで作成し、既存のアカウントや履歴を借用しない。fixture追加前に2表の存在を読取専用で検査する。実DBテストは `KAKOMON_RUN_REVIEW_DB_TESTS === "1"` のときだけ実行する。このflagは検証専用であり、Vercelへの新しい設定は不要。

- [ ] **Step 1: 実DB検証を先に書く。** 一意制約、所有者込みFK、匿名・認証ロールの直接アクセス拒否、登録失敗時の通常解答ロールバック、独立接続の同時解答、再誤答後の古い再送、問題版変更・非公開化、復習前後の報酬表不変を検証する。初回の未適用DBでは不足する表を検出してfixture追加前に失敗することを確認する。Prismaの1接続内にクエリを同時投入せず、競合は別接続で再現する。
- [ ] **Step 2: 実DBへの変更承認と接続先を確認する。** B1の追加SQLを提示し、専用テストDBへの2表・FK・索引・RLS適用とfixture追加を確認してから、検証コピーで `node --import ./tests/helpers/register-title-tests.mjs scripts/apply-test-review-notebook-migration.mjs` を実行する。本番設定を参照するfallback・全DB初期化は使わない。同じSQLの再実行でalreadyApplied=trueとなり、既存行が変わらないことを確認する。
- [ ] **Step 3: 明示有効化して実行する。** 検証コピーの子プロセス環境でだけflagを1に設定し、`node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/review-notebook-database.integration.test.mjs` を実行する。結果は失敗0・skip0が条件。finallyで今回作成したUUIDの子レコード→項目→練習→ユーザー→問題だけを削除し、既存データの総削除・resetを禁止する。
- [ ] **Step 4: 実ブラウザーで一連を確認する。** テスト用設定だけを渡した検証コピーのローカルサーバーで、誤答→結果の件数と導線→一覧→解き直し不正解／正解→F5→通常練習で再誤答→未復習、まで実操作する。ブラウザー確認は専用DBの既存開発ログイン `test-student/test-student2` を利用し、追加した練習IDと変更前後の値を記録する。これらアカウントの既存履歴を削除・初期化せず、ログイン仕様も変えない。別学生・教師から見えないこと、復習でポイントと称号条件が増えないこと、10/11件・試験/分野・戻る操作・通信エラーを確認する。PC・375px・キーボード・コンソールを記録し、画像のみ・長い日本語の問題で横はみ出しがないことを確認する。
- [ ] **Step 5: 全体回帰・ビルドを確認する。** 実DBflagを外した単体環境で `node --import ./tests/helpers/register-title-tests.mjs --test --test-reporter=tap tests/*.test.mjs`、変更ファイルへのlint、Prisma generate、Next typegen、`npm run typecheck`、`node scripts/build-mock-asset-manifest.mjs`、`node node_modules/next/dist/bin/next build` を検証コピーで実行する。基準時点の既存失敗と新規退行を区別し、機能に起因する失敗を放置しない。元の生成物・秘密ファイル・無関係な既存変更のハッシュが変わっていないことを確認する。
- [ ] **Step 6: レビューと引き渡し。** 選択された進め方に従う最終コードレビューで、所有権、再送、競合、未取込、通常報酬の維持、既存UI差分の保護を確認する。検証済み／未検証、実DB変更内容、保留しているUI差分、本番適用に必要な順序を報告する。今回のテストだけを `test: verify review notebook isolation retries and browser flow` としてコミットする。

## 設計との対応と実行境界

- spec1・5節のホーム件数: 独立したA1/A2。
- spec2・6節の対象・新規のみ・3状態: B2/B3/B7/B8。
- spec7・8節の制約・同時保存・競合: B1/B2/B3/B8。
- spec9節の成績・報酬分離: B3/B8。
- spec10節の本人API・ページング・セッション範囲: B2/B4/B7。
- spec11・12節のUI・空状態・復旧・問題変更: B4/B5/B6/B8。
- spec13・14節の検証・保護・適用順: 全タスクの保護条件とB8。

本番DBの適用、mainへの統合、push、Vercelデプロイはこの計画に含めない。必要な既存UI差分を統合する承認、本番バックアップ・追加SQL先行適用の承認を別途受ける。旧アプリへ戻す場合も新規表と復習データを残す。

計画作成時点ではコード・DBを変更しない。この計画と独立したホーム修正計画の内容を確認し、進め方を選択してから実装を開始する。
