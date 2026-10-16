# 月次模擬試験・ランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月次共通模擬試験、試験別ランキング、報酬・称号・未受験通知を、専用テストDBで検証してから段階公開できる状態にする。

**Architecture:** Next.jsの薄いRoute HandlerとPrismaの共通サービスを分離する。固定出題、受験の状態遷移、確定順位、配布進捗を別の責務として保持し、Cron・画面から同じ採点処理を呼ぶ。中間コミットは機能停止状態に保ち、本番移行と公開は最後の別承認にする。

**Tech Stack:** Next.js 16.2.9 / React 19.2.4 / TypeScript / Tailwind CSS / Prisma 7.8 / Supabase PostgreSQL・Cron・Vault・pg_net / Node標準test・crypto。パッケージ追加なし。

**Spec:** `docs/superpowers/specs/2026-10-16-monthly-mock-exam-ranking-design.md`（全文が受け入れ条件。2026-10-16の「進めて」で仕様承認、実装方法は本計画のレビュー後に選択する）。

## Global Constraints

- ITパスポート: `it_passport`、100問、120分、月内最大2回。
- 基本情報技術者 科目A: `fe`、60問、90分、月内最大2回。科目Bは対象外。
- すべての開催日時、月、通知予定日は日本時間 `Asia/Tokyo` とする。
- 受験期間は1日0時以上、25日0時未満。毎月20日9時に両試験未提出者へ1回通知。
- 同じ試験・月では全学生・両受験で同一の問題セットと順序。翌月は再抽選し、過去月との重複は許可。
- 各問同配点の100点換算。表示は小数第2位まで、順位は正解数で比較し、同点は同順位（1・1・3）。
- 初回提出20pt、2回目0pt、両試験40pt。確定1位150pt・2位100pt・3位75pt。同順位全員が対象。
- 全問未回答の提出も0点・回数消費・初回20pt・順位対象。未受験者の結果は作らない。
- 問題別正誤・正解・解説は25日0時までAPI・HTMLにも含めない。AI解説への依存を追加しない。
- ランキングは表示中タブで15秒間隔、非表示中は停止。確定後だけ順位報酬・ランキング称号を判定。
- ランキング称号7種類は試験別実績。永久アンロック・0pt手動購入・手動装備。固定58種類は変更しない。
- DBアクセスはPrisma経由。新規テーブルはRLS有効、ブラウザー直接アクセスの許可なし。
- テストDB: `grzylombpqmidltnbwhx`。本番DB: `ckgoikdjhtklhbzdgxxs`。テストは本番へフォールバックしない。
- 本番DB変更・秘密登録・デプロイ・Cron有効化・git pushは、それぞれ作業直前に別途確認する。
- 新規文書・ソースはUTF-8 / BOMなし / CRLF。既存ファイルは事前検出した形式を保持する。

## Review Focus

1. ロック待ちの間に期限を越えた保存を採用しない。開始要求の再送で2回目を勝手に消費しない（Task 5・6）。
2. 通信結果不明の回答保存と別タブ更新が重なっても、古い内容で上書き・提出・保存済み表示しない（Task 6・9）。
3. 非表示の正解がJSONの余分なキー、RSCのprops、別学生のキャッシュに漏れない（Task 7・9）。
4. 同点0点・単独参加・報酬途中失敗でも順位を変えず、配布と称号通知が増殖しない（Task 11・12）。
5. Cronの遅延・署名付き要求の再送・別環境の秘密混入・実行権の失効で二重実行や永久停止にならない（Task 15・16）。

---

## 作業場所・事前ゲート・検証の共通手順

作業場所は指定フォルダーの `codex/monthly-mock-exam-ranking`。開始時点は仕様書コミット `d65d3a0`。既存の未コミット20ファイル（問題JSON 2、seed 1、Prisma生成物17）と未追跡 `.superpowers/`・`output/`・`supabase/.temp/` は本機能に含めない。`git add .` は使わない。

各Taskの最初に対象ファイルのstrict UTF-8復号・BOM・CRLF/LFを検出し、終了時に再読と差分検査を行う。`src/lib/notifications/read.ts`・`write.ts` はLF、`src/components/student-shell.tsx` は混在改行のため原則変更不要。他の対象も推測で再エンコードしない。

Prisma生成物は2026-10-16時点で `git diff --ignore-all-space --exit-code -- prisma/generated` が0だったが、生成を上書き許可とは解釈しない。Task 2で既存20ファイルのバイト列・差分・SHA256を保護し、同じインストール済みPrismaで旧／新schemaを一時コピー内に生成する。その構造差分だけを既存生成物へ最小適用し、既存の空白差分は保持・非ステージのまま残す。内容の競合があれば生成を中断して確認する。`npm run build` の自動生成も原本で実行せず、Task 17の検証コピーで行う。

Next.js同梱の `15-route-handlers.md`、`route.md`、`dynamic-routes.md`、`data-security.md` は計画作成時に確認済み。実行時も該当ガイドを確認し、`params` / `searchParams` をawaitする。認証データへ `use cache`・静的生成を使わず、APIは `Cache-Control: private, no-store, max-age=0` と `Vary: Cookie`。正解を扱うモジュールをクライアントへimportしない。

テストの共通コマンドを以下のように表記する。実行時は別名や新npmスクリプトを増やさず、完全なコマンドへ展開する。

- `UNIT <file>` = `node --import ./tests/helpers/register-title-tests.mjs --test <file>`。
- `DB <file>` = PowerShellで `$env:KAKOMON_RUN_MOCK_DB_QA='1'` を設定し、`node --import ./tests/helpers/register-title-tests.mjs --test --test-concurrency=1 <file>` を実行、finallyで元の値へ戻す。接続は `loadTestConfig()` の戻り値から作った独立Prisma接続2本だけ。DB suite同士は並列実行しない。
- 赤: 新規テストが対象の未実装／期待値不一致でFAIL。接続・import事故だけのFAILを実装根拠にしない。緑: 対象テストFAIL 0、実DBのskip 0。
- コミット前: 対象テスト＋`npm run typecheck`、`git diff --check`、文字コード検証。生成物の既存空白やデータ差分を含めないよう、対象パス指定＋必要な生成ハンクだけをステージする。
- 各テスト例は対象関数をFiles欄のモジュールからimportし、Nodeの `test` / `assert` / `randomUUID` を使う。各コミットは `git add -- <そのTaskのFiles欄の実パス>` と記載の `git commit -m "..."`。生成物の重複パスは `git add -p -- prisma/generated` で機能ハンクだけを選び、既存差分を含めない。

## ファイルマップと共有契約

新規ドメインは `src/lib/mock-exams/` にまとめる。`contract.ts` は公開DTOと入力型だけ、`schedule.ts` はJST日程、`grading.ts` は純粋採点、`environment.ts` は停止スイッチと接続先照合、`locks.ts` はロック・DB時計、`question-pool.ts` / `prepare.ts` は固定出題、`start.ts` / `answers.ts` / `submit.ts` は受験変更、`read.ts` / `handlers.ts` は安全な読取とHTTP境界、`ranking.ts` / `settlement.ts` / `rewards.ts` は暫定順位・確定・配布、`reminders.ts` は通知、`jobs.ts` / `job-auth.ts` は定期実行を担当する。依存は契約→純粋処理→Prismaサービス→HTTP/UIの一方向。

Task 1で次の型を定義し、後続Taskは勝手に別名・別プロパティへ変更しない。

- `ExamCode = 'it_passport' | 'fe'`、`MonthKey = string`（実行時に実在する `YYYY-MM` のみ許可）、`MockActor = {id:string; roleName:string; status:string; deletedAt:Date|null}`。
- `MockError` は `code:string`・`status:400|401|403|404|409|503`・公開用message。未知の例外は固定文言の500へ変換する。
- `MockSchedule = {month:MonthKey; opensAt:Date; closesAt:Date; reminderAt:Date}`。`MockPolicy = {questionCount:number; timeLimitMinutes:number; maxAttempts:2; participationPoints:20}`。
- `StartInput = {mockExamId:string; requestId:string}`。`SaveInput = {attemptId:string; mockQuestionId:string; selectedChoiceId:string|null; expectedRevision:number; requestId:string}`。`SubmitInput = {attemptId:string; expectedRevision:number}`。IDはUUID、revisionは非負整数。未知の入力キーを拒否する。
- `MockQuestionView = {id:string; orderNo:number; questionText:string; imagePath:string|null; sourceLabel:string; choices:{id:string; label:string; text:string; orderNo:number}[]}`。
- `SavedAnswerView = {mockQuestionId:string; selectedChoiceId:string|null; revision:number}`。`AttemptView = {id:string; mockExamId:string; attemptNo:1|2; status:'in_progress'|'submitted'; startedAt:string; expiresAt:string; serverNow:string; revision:number; questions:MockQuestionView[]; answers:SavedAnswerView[]}`。
- `ResultView = {attemptId:string; mockExamId:string; attemptNo:1|2; answeredCount:number; correctCount:number; totalQuestions:number; score:number; earnedPoints:number; bestAttemptId:string; bestScore:number; submittedAt:string; reviewAvailableAt:string; review:ReviewQuestionView[]|null}`。`ReviewQuestionView` は `MockQuestionView` に `selectedChoiceId:string|null; correctChoiceId:string; isCorrect:boolean; explanation:string` を追加する。締切前の `review` はnull。
- `StartResult = {kind:'attempt'; attempt:AttemptView}|{kind:'result'; result:ResultView}`。`SaveResult = {kind:'saved'; answer:SavedAnswerView; attemptRevision:number; serverNow:string}|{kind:'submitted'; result:ResultView}`。期限切れ時の保存・再開は後者へ導き、書込みはしない。
- `MockListView = {month:MonthKey; historyMonths:MonthKey[]; exams:MockExamCardView[]}`。カードは `id,examCode,title,questionCount,timeLimitMinutes,opensAt,closesAt,state,remainingAttempts,activeAttemptId,results` を持つ。日時はISO、stateは `preparing|upcoming|open|closed`、resultsは本人の `ResultView[]`、存在しない試験のidはnull。
- `RankResult = {userId:string; attemptId:string; attemptNo:1|2; correctCount:number; totalQuestions:number}`。`RankedResult` はこれに `rankNo:number; score:number` を追加。`RankingView = {examCode:ExamCode; month:MonthKey; availableMonths:MonthKey[]; state:'provisional'|'settling'|'final'; top:RankingStudentView[]; mine:RankingStudentView|null; rewardsComplete:boolean}`。学生表示は `userId,rankNo,score,displayName,avatarUrl,currentTitleName,profileHref`（後ろ3つはnull可）。
- `MockServices` はTask 7の7操作、`getRanking`（Task 10）を持つサーバー側インターフェース。`MockClock = (tx:Prisma.TransactionClient)=>Promise<Date>` は本番で `clock_timestamp()`、テストでのみ差替。HTTPから時計を指定する機能は作らない。

実DBfixtureはTask 2の `withMockDb({examCode,month,userCount?,prepared?}, run)`。`run(f)` のfは `db,other`（独立PrismaClient）、`actor`（先頭の有効学生）、`actors`（全学生）、`mockExamId`、`questions`（固定問題＋`correctChoiceId`）、`now():Date`、`setNow(Date):void`、`clock:MockClock`、`trackExam(id:string):void`。標準は有効な100問または60問・学生2人・当月2日正午の仮想時計。prepared=falseでは試験を作らず、prepareテストが作成したIDをtrackExamで追跡する。対象試験/月に既存行があれば所有扱いせず開始拒否し、関数終了時に自分のUUIDで作成した行だけをFK順に削除する。callback中だけ検証済みテストconfigのmockスイッチ/接続先を設定しfinallyで元の環境へ戻す。実DBtestは明示opt-inし、通常のUNITでは接続しない。

## Task 1: 日程・採点・公開契約と停止スイッチ

**Files:** Create `src/lib/mock-exams/contract.ts`, `schedule.ts`, `grading.ts`, `environment.ts`; Test `tests/mock-schedule.test.mjs`, `tests/mock-grading.test.mjs`, `tests/mock-environment.test.mjs`。
**Interfaces:** `getMockPolicy(code:ExamCode):MockPolicy`; `getMockSchedule(month:MonthKey):MockSchedule`; `getAttemptDeadline(startedAt:Date,schedule:MockSchedule,minutes:number):Date`; `scorePercent(correct:number,total:number):number`; `readMockEnvironment(env:NodeJS.ProcessEnv):{enabled:boolean;startsEnabled:boolean;jobsEnabled:boolean;projectRef:string}`。

- [ ] 新規テストで正確な境界と無効入力を固定する。
  ```js
  test('JST cutoff and equal weighting', () => {
    const s = getMockSchedule('2026-10');
    assert.equal(s.opensAt.toISOString(), '2026-09-30T15:00:00.000Z');
    assert.equal(s.closesAt.toISOString(), '2026-10-24T15:00:00.000Z');
    assert.equal(s.reminderAt.toISOString(), '2026-10-20T00:00:00.000Z');
    assert.equal(getAttemptDeadline(new Date('2026-10-24T14:30:00Z'), s, 90).toISOString(), s.closesAt.toISOString());
    assert.equal(scorePercent(50, 60), 83.33);
    assert.deepEqual(['it_passport','fe'].map(c=>[getMockPolicy(c).questionCount,getMockPolicy(c).timeLimitMinutes,getMockPolicy(c).maxAttempts]), [[100,120,2],[60,90,2]]);
  });
  ```
  同じsuiteに2024-02、12→1月、非実在月、NaN・負数・分母0・正解数超過を拒否するassertを追加。環境未設定は3スイッチfalse、test projectとproduction DBの不一致は例外になることをassertする。
- [ ] `UNIT tests/mock-schedule.test.mjs tests/mock-grading.test.mjs tests/mock-environment.test.mjs` →対象関数未実装で赤。
- [ ] 上記関数と共有型を実装する。サーバー変数は `KAKOMON_MOCK_ENABLED` / `KAKOMON_MOCK_STARTS_ENABLED` / `KAKOMON_MOCK_JOBS_ENABLED` / `KAKOMON_MOCK_PROJECT_REF`。true以外は停止、projectRefをSupabase URLおよびDB URLの接続先と照合し、設定値・秘密をログへ出さない。
- [ ] 同コマンドを緑にし、未設定では既存アプリがDBの新カラムを参照しないことをテストする。
- [ ] このTaskの上記7ファイルだけをステージし、`feat: define monthly mock exam contracts and schedule` でコミットする。

## Task 2: 追加マイグレーションと隔離DB検証の足場

**Files:** Modify `prisma/schema.prisma:119`, `:279`, `:458`, `:563` と必要な逆relation; Create `supabase/migrations/20261016000000_monthly_mock_exams.sql`, `tests/helpers/mock-db.mjs`, `tests/mock-schema.test.mjs`, `tests/mock-schema.integration.test.mjs`; 生成物は共通手順で必要な構造差分だけ。
**Interfaces:** 前述の `withMockDb(options,run):Promise<void>`。既存の `loadTestConfig()` を再利用。SQLはBEGIN内で5既存テーブルの空判定とACCESS EXCLUSIVEロックを行ってから参照を変更する。

- [ ] schemaテストは `attempt_no IN (1,2)`、同一試験・学生の進行中partial unique、試験別順位unique、同点許可、nullable回答、Decimal(5,2)、RLS、FK索引をassertする。実DBテストは制約違反を実INSERTで確認し、移行前の非空ケースでは全変更がrollbackされることを専用トランザクションで確認する。
  ```js
  test('empty-only migration guards are present', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261016000000_monthly_mock_exams.sql', import.meta.url), 'utf8');
    for (const table of ['mock_exams','mock_exam_questions','mock_attempts','mock_answers','monthly_rankings']) assert.ok(sql.includes(table));
    assert.match(sql, /RAISE EXCEPTION/); assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE/i);
  });
  ```
- [ ] `UNIT tests/mock-schema.test.mjs` で赤を確認する。
- [ ] schema/SQL/fixtureを実装する。出題問題へ文・画像パス・解説・分野code・出典snapshot、`mock_exam_choices`へ固定選択肢と元IDを追加。受験へ `startRequestId,attemptNo,expiresAt,gradedAt,answeredCount,revision`、回答へ `mockExamId,mockQuestionId,revision,lastRequestId` を追加し元問題／選択肢FKから切替える。複合FKで受験・出題・選択肢の所属を強制する。順位へ `mockExamId,bestAttemptId,correctCount,totalQuestions,isFinal,rewardProcessedAt`、試験へ `rankingFinalizedAt,rewardsCompletedAt`、通知へ `targetMonth` を追加する。`mock_exam_job_runs` は `jobKey` unique・kind・month・examCode・status・attempts・leaseToken・leaseUntil・nextRunAt・cursor・lastErrorCode・lastErrorAt・completedAt・createdAt・updatedAtを持つ。業務keyは `kind:YYYY-MM:examCode`（全体はall）、署名再送keyは `dispatch:nonce`。確定順位・採用受験をユーザー削除で連鎖削除しないFKにする。
- [ ] 既存生成物を保護して必要な型を反映。テストDBの5テーブルが空であることを再確認し、計画レビューでDB変更承認が得られている場合だけ追加SQLを適用する。非空なら削除せず停止・相談。`UNIT tests/mock-schema.test.mjs` と `DB tests/mock-schema.integration.test.mjs` →緑。公開/認証ロールの直接読書き拒否も確認する。
- [ ] 対象schema・SQL・3テスト/fixtureと機能由来の生成ハンクだけをステージし、`feat: add isolated monthly mock exam persistence` でコミットする。

## Task 3: 画像資産確認と月別問題セットの固定

**Files:** Create `scripts/build-mock-asset-manifest.mjs`, `src/lib/mock-exams/question-assets.json`, `question-pool.ts`, `prepare.ts`, `tests/mock-question-pool.test.mjs`, `tests/mock-prepare.integration.test.mjs`; Modify `next.config.ts:1`（ビルド時manifest検証）。
**Interfaces:** `prepareMockExam(db:PrismaClient,input:{examCode:ExamCode;month:MonthKey},clock?:MockClock):Promise<{mockExamId:string;created:boolean}>`; `isEligibleMockQuestion(question:PoolQuestion,assets:ReadonlySet<string>):boolean`; `selectMockQuestions(candidates:readonly PoolQuestion[],count:number,randomInt:(max:number)=>number):PoolQuestion[]`。`PoolQuestion` は元Questionの公開状態・年度・試験code・分野code・文・画像・出典・4択を明示selectした型を同ファイルで定義。

- [ ] 年度不明・削除済み・非公開・別試験・3択・正解0/2・必須画像欠落を除外し、FEの6桁年度と科目A修了問題を含めるテストを書く。
  ```js
  test('insufficient pool cannot silently reduce the exam length', () => {
    const candidates=Array.from({length:59},(_,i)=>({id:String(i)}));
    assert.throws(()=>selectMockQuestions(candidates,60,()=>0), e=>e.code==='insufficient_questions');
  });
  ```
  実DBではprepared=falseの空き月を使い、並行prepare2件の同一ID・100/60問の同一順序をassertして新規IDだけtrackExamする。途中insert失敗のrollback、元データ変更後のsnapshot不変は自作fixture行だけで検証し、既存問題のstatusを変更しない。
- [ ] `UNIT tests/mock-question-pool.test.mjs` →赤。
- [ ] manifestをpublic配信資産の実在ファイルから決定的に生成し、ビルド時に差分/欠落を拒否する。抽選は一貫した読取＋試験/月ロック下でFisher–Yatesを使い、DB snapshotを一括保存する。成功済みセットを再抽選しない。外部画像を許可せず、実行時のファイル書込み・画像HTTP巡回はしない。
- [ ] `UNIT tests/mock-question-pool.test.mjs`、`DB tests/mock-prepare.integration.test.mjs` →緑。採用済み画像を保持する運用チェックも追加する。
- [ ] 上記7ファイルだけをステージし、`feat: prepare immutable monthly mock question sets` でコミットする。

## Task 4: 共通の採点・受験報酬トランザクション

**Files:** Create `src/lib/mock-exams/locks.ts`, `submit.ts`, `read.ts`, `tests/mock-submit.integration.test.mjs`。
**Interfaces:** `lockMockAttempt(tx:Prisma.TransactionClient,actor:MockActor,attemptId:string):Promise<MockAttempt>`（Prisma型）; `dbNow(tx:Prisma.TransactionClient):Promise<Date>`; `gradeLockedAttempt(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<void>`; `submitMockAttempt(db:PrismaClient,actor:MockActor,input:SubmitInput,clock?:MockClock):Promise<ResultView>`。read.tsに内部用 `toMockAttemptView(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<AttemptView>` と `toMockResultView(tx:Prisma.TransactionClient,attemptId:string,now:Date):Promise<ResultView>` を定義し、締切で正解情報を除去する。認証/所有確認は呼出元が必ず行う。

- [ ] 初回20pt・2回目0pt・両試験40pt、blank提出、submit再送、期限と実処理時刻の分離、途中例外の全rollbackを実DBテストにする。
  ```js
  test('blank submission is ranked zero but not an answered question', async () => withMockDb({examCode:'fe',month:'2036-10'}, async f => {
    const a = await f.db.mockAttempt.create({data:{mockExamId:f.mockExamId,userId:f.actor.id,startRequestId:randomUUID(),attemptNo:1,totalQuestions:60,expiresAt:new Date(+f.now()+5400000)}});
    const r = await submitMockAttempt(f.db,f.actor,{attemptId:a.id,expectedRevision:0},f.clock);
    assert.deepEqual([r.score,r.answeredCount,r.earnedPoints],[0,0,20]);
    assert.equal((await f.db.studentProfile.findUnique({where:{userId:f.actor.id}})).totalPracticeCount,0);
  }));
  ```
- [ ] `DB tests/mock-submit.integration.test.mjs` →未実装で赤（接続先ガード確認後）。
- [ ] 試験→userのNO KEY UPDATE→profile→attemptの順を固定し、期限は全ロック取得後のDB時計で判定する。自動提出は `submittedAt=expiresAt`、manualはDB時刻、`gradedAt`は実処理時刻。最終選択だけ採点・集計し、`mock_participation` / sourceType `mock_exam` / sourceId試験IDの既存uniqueで初回報酬を保護する。正誤、受験状態、プロフィール回答/正解/points、ledgerを同一txで確定。background採点ではactivityを記録しない。
- [ ] 上記DBテストを緑にし、独立2接続のsubmit/manual対自動採点競合とプロフィール／ledger一致を確認する。単一接続の待ち行列を並行検証と扱わない。
- [ ] 上記4ファイルをステージし、`feat: grade mock attempts and participation rewards atomically` でコミットする。

## Task 5: 開始・再開・回数制限

**Files:** Create `src/lib/mock-exams/start.ts`, `tests/mock-start.integration.test.mjs`。
**Interfaces:** `startMockAttempt(db:PrismaClient,actor:MockActor,input:StartInput,clock?:MockClock):Promise<StartResult>`。Task 4のロックと採点を利用する。

- [ ] 同一requestIdの再送、別IDの同時開始、2回目、3回目拒否、期限ちょうど、期限切れ再開をテストする。
  ```js
  test('a replay of completed first start never starts attempt two', async () => withMockDb({examCode:'fe',month:'2036-10'}, async f => {
    const input={mockExamId:f.mockExamId,requestId:randomUUID()};
    const a=await startMockAttempt(f.db,f.actor,input,f.clock);
    await submitMockAttempt(f.db,f.actor,{attemptId:a.attempt.id,expectedRevision:0},f.clock);
    const replay=await startMockAttempt(f.db,f.actor,input,f.clock);
    assert.equal(replay.kind,'result'); assert.equal(replay.result.attemptId,a.attempt.id);
    assert.equal(await f.db.mockAttempt.count({where:{userId:f.actor.id}}),1);
  }));
  ```
- [ ] `DB tests/mock-start.integration.test.mjs` →赤。
- [ ] 同じ開始IDは終了後も元の受験へ、別IDでも進行中があればその受験へ戻す。進行中が期限切れなら採点結果を返し、2回目を自動作成しない。新規操作だけ次の番号を採番し、期限を保存する。教師・停止学生・公開前・25日以降・準備失敗を拒否する。
- [ ] 同DBテストを緑にする。ロック待ち中に25日0時を越えるテストで受験件数不変をassertする（Review Focus 1）。
- [ ] 上記2ファイルをステージし、`feat: start and resume bounded mock exam attempts` でコミットする。

## Task 6: 回答の自動保存と競合検出

**Files:** Create `src/lib/mock-exams/answers.ts`, `tests/mock-answer.integration.test.mjs`。
**Interfaces:** `saveMockAnswer(db:PrismaClient,actor:MockActor,input:SaveInput,clock?:MockClock):Promise<SaveResult>`。

- [ ] 選択変更・null解除・同一再送・別問題選択肢・後続変更後の古い再送・他人の受験・保存と提出の競合をテストする。
  ```js
  test('late replay cannot restore a superseded selection', async () => withMockDb({examCode:'fe',month:'2036-10'}, async f => {
    const a=await startMockAttempt(f.db,f.actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock);
    const input={attemptId:a.attempt.id,mockQuestionId:f.questions[0].id,selectedChoiceId:f.questions[0].correctChoiceId,expectedRevision:0,requestId:randomUUID()};
    const saved=await saveMockAnswer(f.db,f.actor,input,f.clock);
    await saveMockAnswer(f.db,f.actor,{...input,selectedChoiceId:null,expectedRevision:saved.answer.revision,requestId:randomUUID()},f.clock);
    await assert.rejects(saveMockAnswer(f.db,f.actor,input,f.clock),e=>e.status===409);
    await assert.rejects(submitMockAttempt(f.db,f.actor,{attemptId:a.attempt.id,expectedRevision:0},f.clock),e=>e.status===409);
  }));
  ```
- [ ] `DB tests/mock-answer.integration.test.mjs` →赤。
- [ ] 問題単位revisionと直近requestId＋内容で再送を識別し、変更時だけ受験全体revisionも進める。保存成功の実選択操作だけ `recordTitleAnswer` で利用日を更新し、まだ累計回答数は増やさない。期限到達ならTask 4で採点してsubmitted結果を返す。競合409は最新の安全な再取得へ導く。
- [ ] 同DBテストを緑にする。DBの実際の待機を確認してから時計を期限へ進め、待機後保存の不採用をassertする。同一ID・別payloadも409にする（Review Focus 1・2）。
- [ ] 上記2ファイルをステージし、`feat: autosave mock answers with optimistic concurrency` でコミットする。

## Task 7: 正解を漏らさない読取・学生API

**Files:** Modify `src/lib/mock-exams/read.ts`; Create `src/lib/mock-exams/handlers.ts`, `src/app/api/mock-exams/route.ts`, `src/app/api/mock-exams/[mockExamId]/start/route.ts`, `src/app/api/mock-exams/attempts/[attemptId]/route.ts`, `src/app/api/mock-exams/attempts/[attemptId]/answer/route.ts`, `src/app/api/mock-exams/attempts/[attemptId]/submit/route.ts`, `src/app/api/mock-exams/attempts/[attemptId]/result/route.ts`, `tests/mock-api.test.mjs`, `tests/mock-read.integration.test.mjs`。
**Interfaces:** `getMockList(db,actor,month,clock?):Promise<MockListView>`; `getMockAttempt(db,actor,attemptId,clock?):Promise<StartResult>`; `getMockResult(db,actor,attemptId,clock?):Promise<ResultView>`。`MockServices` はこの3つ＋start/save/submit＋`getRanking(actor,examCode,month)`を、db・clock束縛後のsignatureで持つ。`createMockHandlers({getUser:()=>Promise<MockActor|null>,services:MockServices})` がlist/start/attempt/answer/submit/result/rankingの `(request:Request,params?:Record<string,string>)=>Promise<Response>` を返す。

- [ ] 401/403/404/409、不正JSON/UUID/month/キー/版、sameOrigin、no-store、他人・教師・停止学生をテストする。全学生応答を深く走査して締切前は `isCorrect,correctChoiceId,explanation` がないこと、review=null、締切ちょうど以降だけ正解解説が現れることをassertする。
  ```js
  test('pre-close result has no review', async () => withMockDb({examCode:'fe',month:'2036-10'}, async f => {
    const a=await startMockAttempt(f.db,f.actor,{mockExamId:f.mockExamId,requestId:randomUUID()},f.clock);
    await submitMockAttempt(f.db,f.actor,{attemptId:a.attempt.id,expectedRevision:0},f.clock);
    const r=await getMockResult(f.db,f.actor,a.attempt.id,f.clock);
    assert.equal(r.review,null); assert.equal(JSON.stringify(r).includes('correctChoiceId'),false);
    f.setNow(getMockSchedule('2036-10').closesAt);
    assert.equal((await getMockResult(f.db,f.actor,a.attempt.id,f.clock)).review.length,60);
  }));
  ```
- [ ] `UNIT tests/mock-api.test.mjs` →赤。
- [ ] DTOをallowlistで組み立て、元Prisma行のspreadを禁止する。結果・再開時にも本人の期限切れを共通採点。APIはNode runtime、認証・有効role・本人所有・同一Origin・入力を毎回検証し、内部例外を隠す。GETは認証後の期限整合だけを補完し、試験開始や任意ジョブを起動しない。存在不明IDは404、所有者違いは403。フラグ停止時は503で旧アプリに影響させない。
- [ ] `UNIT tests/mock-api.test.mjs` と `DB tests/mock-read.integration.test.mjs` →緑。異なる学生の連続アクセスで回答・結果を共有しないことをassertする（Review Focus 3）。
- [ ] 上記10ファイルだけをステージし、`feat: expose private mock exam APIs with delayed review` でコミットする。

## Task 8: 模試の提出実績を既存称号へ連携

**Files:** Modify `src/lib/titles/facts.ts:14`, `src/lib/mock-exams/submit.ts`; `tests/helpers/title-memory.mjs`, `tests/title-facts.test.mjs`; Create `src/lib/mock-exams/title-facts.ts`, `tests/mock-title-learning.test.mjs`。
**Interfaces:** `collectMockLearningFacts(tx:Prisma.TransactionClient,userId:string):Promise<{answerCount:number;categoryCorrect:Record<TitleCategory,number>}>`。`collectTitleFacts(tx,userId,now,options?:{mockExamsEnabled:boolean}):Promise<TitleFacts>` は既存3引数呼出しと互換とし、省略時は検証済み環境のenabledを使う。既存 `syncTitleUnlocks` のsignatureは維持する。

- [ ] 提出済み非null回答のみ2回分を含め、in_progress・未回答・再送を除外するテストを書く。
  ```js
  test('mock aggregate adds answers, not practice completion', async () => {
    const db=makeTitleMemory({mockFacts:{answerCount:2,categoryCorrect:{technology:2,management:0,strategy:0}}});
    const facts=await collectTitleFacts(db.tx,'student',new Date('2036-10-02T00:00:00Z'),{mockExamsEnabled:true});
    assert.equal(facts.answerCount,2); assert.equal(facts.categoryCorrect.technology,2);
    assert.equal(facts.hasCompletedPractice,false); assert.equal(facts.hasPerfect60,false); assert.equal(facts.randomCorrectMaxRun,0);
  });
  ```
- [ ] `UNIT tests/mock-title-learning.test.mjs tests/title-facts.test.mjs` →新assertが赤。
- [ ] 模試分はPrisma groupBy/集約で取得し、全解答本文や全学生履歴を読まない。機能停止時は新テーブルへ問い合わせずゼロ集計を返す。採点tx内で既存の永久アンロックと通知まで整合させる。既存の実選択日記録を使い、採点実行日を新しい活動日として推定しない。過去問練習専用統計・条件と、日次/ランダム連続条件はそのまま。
- [ ] 同UNITとTask 4のDBテストを緑にし、模試後にポイント・累計・通知の途中失敗が一括rollbackされることを追加assertする。
- [ ] 上記6ファイルをステージし、`feat: count submitted mock answers toward learning titles` でコミットする。

## Task 9: 学生の一覧・受験・結果画面

**Files:** Create `src/app/mock-exam/page.tsx`, `mock-exam-list.tsx`, `attempts/[attemptId]/page.tsx`, `attempts/[attemptId]/mock-attempt.tsx`, `attempts/[attemptId]/result/page.tsx`, `attempts/[attemptId]/result/mock-result.tsx`, `src/lib/mock-exams/client-state.ts`, `tests/mock-client-state.test.mjs`, `tests/mock-student-render.test.mjs`。
**Interfaces:** `createAnswerQueue(send:(input:SaveInput)=>Promise<SaveResult>,reload:()=>Promise<StartResult>):{save(input:SaveInput):Promise<SaveResult>;flush():Promise<void>;hasPending():boolean}`。React側はTask 7のDTOだけをpropsに受ける。

- [ ] 保存キューの応答喪失・同じ問題連打・409・未保存の提出拒否、再開で期限不変をテストする。renderテストは一覧2試験、残回数、履歴、未回答数、解説未登録文言と締切前のHTML非漏えいをassertする。
  ```js
  test('lost save response is not shown as saved', async () => {
    let reloads=0; const q=createAnswerQueue(async()=>{throw new Error('offline')},async()=>{reloads++;throw new Error('offline')});
    await assert.rejects(q.save({attemptId:randomUUID(),mockQuestionId:randomUUID(),selectedChoiceId:null,expectedRevision:0,requestId:randomUUID()}));
    await assert.rejects(q.flush()); assert.equal(reloads,1);
  });
  ```
- [ ] `UNIT tests/mock-client-state.test.mjs tests/mock-student-render.test.mjs` →赤。
- [ ] 既存StudentShell・問題文/選択肢の表示専用部品を再利用し、即時採点の練習操作は使わない。DB期限とserverNowを基準に残り時間を表示し、前後・番号移動・変更/解除・保存状態・未回答の提出確認・結果・過去月を実装する。要求IDを同一操作の再送中維持し、保存完了後の最新版で提出する。期限時は勝手な延長や未保存回答の採用を表示しない。
- [ ] 同UNITを緑にし、ブラウザーで2タブ更新後の409再確認、offline→復旧、キーボード/確認dialogフォーカス、PC・375px幅、RSC/HTMLへの正解非混入を確認する（Review Focus 2・3）。ブラウザーskillを実行時に使用する。
- [ ] 上記9ファイルをステージし、`feat: add student mock exam experience` でコミットする。

## Task 10: 暫定ランキングと15秒更新

**Files:** Create `src/lib/mock-exams/ranking.ts`, `src/app/api/rankings/route.ts`, `src/app/ranking/page.tsx`, `ranking-view.tsx`, `src/lib/mock-exams/ranking-poll.ts`, `tests/mock-ranking.test.mjs`, `tests/mock-ranking-render.test.mjs`; Modify `src/lib/mock-exams/handlers.ts`。
**Interfaces:** `rankBestAttempts(rows:readonly RankResult[]):RankedResult[]`; `getMockRanking(db,actor:MockActor,examCode:ExamCode,month:MonthKey,clock?:MockClock):Promise<RankingView>`; `startRankingPolling({refresh,visibility,subscribe}):()=>void`（refreshはasync、visibilityはboolean取得、subscribeはvisibility変更callback登録・解除を返す）。

- [ ] 最高点・同点時の初回代表・1/1/3・上位3順位の全同点者・自分・未提出除外・試験/月分離を固定する。
  ```js
  test('competition ranks keep every tie', () => {
    const base={totalQuestions:60,attemptNo:1};
    const rows=[['a',50],['b',50],['c',40],['d',40]].map(([userId,correctCount])=>({...base,userId,attemptId:userId,correctCount}));
    assert.deepEqual(rankBestAttempts(rows).map(r=>r.rankNo),[1,1,3,3]);
  });
  ```
  仮想timerでvisible15秒ごと1回・hidden0回・再表示直後1回・unmount解除・同時fetchなしをassertする。
- [ ] `UNIT tests/mock-ranking.test.mjs tests/mock-ranking-render.test.mjs` →赤。
- [ ] 正解数で順位を計算し、同点内userId順、topの条件は人数3人でなくrankNo<=3。ランキング取得時に期限切れを最大25件補完し、残件があればsettlingとする。確定後は保存順位を読み、現在の安全なプロフィール表示と結合する。利用停止学生は導線を無効化し順位を詰めない。試験/月切替とmine、試験提出後refreshを実装する。
- [ ] 同UNITと読取DBテストを緑にし、リクエスト順逆転による古い月の上書きも防ぐ。確定前はisFinal行を作らず、順位称号を発行しないことをassertする。上位同点者が多い場合も一覧を切り捨てず、virtualな順位の付替えをしない。
- [ ] 上記8ファイルをステージし、`feat: add live exam-specific monthly rankings` でコミットする。

## Task 11: 締切後の順位固定と冪等な配布

**Files:** Create `src/lib/mock-exams/settlement.ts`, `rewards.ts`, `tests/mock-settlement.integration.test.mjs`。
**Interfaces:** `settleMockExamBatch(db,mockExamId:string,clock?:MockClock):Promise<{phase:'grading'|'ranked'|'complete';remaining:number}>`; `rewardMockRanking(db,rankingId:string,clock?:MockClock):Promise<{rewardPoints:number;alreadyProcessed:boolean}>`。

- [ ] 25日前の確定拒否、未採点分の先行処理、rank1/1/3の150/150/75、snapshot不変、配布途中rollback・再開をテストする。
  ```js
  test('zero and single participant rewards are not silently excluded', () => {
    assert.deepEqual(rankBestAttempts([{userId:'one',attemptId:'a',attemptNo:1,correctCount:0,totalQuestions:60}]).map(r=>[r.rankNo,r.score]),[[1,0]]);
  });
  ```
  実DBでも0点同点2人の各150pt、未受験者0pt、再実行後ledger1行/人をassertする。全対象0人でも空の確定済みとして完了できることを含める（Review Focus 4）。
- [ ] `UNIT tests/mock-ranking.test.mjs` に上記assertを追加し、`DB tests/mock-settlement.integration.test.mjs` →新serviceが赤。
- [ ] 最大25受験ずつ採点し、残件0をロック下で再確認してからbest/rankを一括snapshot化し `rankingFinalizedAt` を設定する。報酬は学生1人ずつ短いtxで `mock_rank_reward` / `monthly_ranking` / sourceId確定行IDを根拠に付与・処理済み化する。全行完了後だけ `rewardsCompletedAt`。確定順位を再生成せず、外部HTTPをtxに入れない。
- [ ] DBテストを緑にする。通知失敗を注入した配布txは残高・ledger・processedAtすべて不変、次回成功時だけ1回分になることを確認する（Task 12の連携後に再実行）。
- [ ] 上記3ファイルと追加したランキングtestをステージし、`feat: finalize mock rankings and distribute rewards safely` でコミットする。

## Task 12: ランキング称号7種類の有効化

**Files:** Create `src/lib/mock-exams/ranking-title-facts.ts`, `tests/mock-ranking-titles.test.mjs`; Modify `src/lib/titles/contract.ts:28`, `facts.ts:14`, `rules.ts:77`, `catalog.ts`, `src/lib/mock-exams/rewards.ts`, `tests/fixtures/title-facts.mjs`, `tests/helpers/title-memory.mjs`, `tests/title-catalog.test.mjs`, `tests/title-rules.test.mjs`。
**Interfaces:** `RankingTitleFacts = Record<ExamCode,{rankCounts:Record<1|2|3,number>;topThreeMaxRun:number}>` をcontractへ追加。`collectRankingTitleFacts(tx,userId):Promise<RankingTitleFacts>` は確定済み新試験別行だけを集約。TitleFactsへ `ranking:RankingTitleFacts` を追加する。

- [ ] 1位1回、2/3位各1回・通算3回、1位通算3回、同一試験top3連続5暦月、12→1月、欠月・4位・試験混在・過去最大をテストする。
  ```js
  test('silver counts from different exams do not combine', () => {
    const ranking={it_passport:{rankCounts:{1:0,2:2,3:0},topThreeMaxRun:0},fe:{rankCounts:{1:0,2:1,3:0},topThreeMaxRun:0}};
    const keys=evaluateTitleRules(makeTitleFacts({ranking}),TITLE_CATALOG);
    assert.equal(keys.includes('v1-040'),false); assert.equal(keys.includes('v1-042'),true);
    assert.equal(COMPLETE_COLLECTION_V1_KEYS.length,58);
  });
  ```
- [ ] `UNIT tests/mock-ranking-titles.test.mjs tests/title-catalog.test.mjs tests/title-rules.test.mjs` →新条件assertが赤。
- [ ] 7定義のimplementedだけを有効化し、既存条件名・キー・価格を維持する。`monthly_rank` は順位の完全一致、top_runのみ<=3。試験ごとの暦月連続最大を集約し、どちらか片方の達成でqualifyする。機能停止時は新テーブルを読まずゼロ実績を返す。配布txと日常のショップ再評価の両方から既存 `syncTitleUnlocks` を使い、再通知・自動所有/装備はしない。
- [ ] 同UNITとTask 11 DBを緑にする。暫定行・旧形式行の除外、永久資格・通知1回・ポイント0手動購入・58キー不変を確認する（Review Focus 4）。既存の「順位条件無効」テストは「確定実績なしでは未達」へ意味を限定して更新する。
- [ ] 上記11ファイルをステージし、`feat: unlock titles from finalized per-exam rankings` でコミットする。

## Task 13: 20日9時の未受験ベル通知

**Files:** Create `src/lib/mock-exams/reminders.ts`, `tests/mock-reminders.integration.test.mjs`; Modify `src/lib/notifications/contract.ts:1`, `read.ts:15`, `write.ts`, `tests/notifications-contract.test.mjs`。
**Interfaces:** `sendMockRemindersBatch(db,month:MonthKey,cursor:string|null,clock?:MockClock):Promise<{sent:number;nextCursor:string|null}>`。NotificationTypeへ `mock_exam_reminder`、NotificationViewへnullable `targetMonth` を追加する。

- [ ] 20日9時直前0通・ちょうど両試験未提出1通・進行中1通・どちらか提出済み0通・再送0追加・25日0通・予定時刻後新規登録0通をassertする。
  ```js
  test('reminder targets the month not the title shop', () => {
    assert.equal(notificationTarget({type:'mock_exam_reminder',postId:null,targetMonth:'2036-10'}),'/mock-exam?month=2036-10');
  });
  ```
- [ ] `UNIT tests/notifications-contract.test.mjs` に上記を追加し赤を確認する。
- [ ] 最大100学生、userIdカーソルで処理。通知直前のtx内にactive/student/deletedAt・登録日時・両試験の提出を再確認し、recipient/type/month unique＋skipDuplicatesで1回にする。文言は「今月の模擬試験は24日まで受験できます」。既存の個別既読・ベル・通知一覧をそのまま利用し、返信アイコンや全既読を追加しない。
- [ ] 同UNITと `DB tests/mock-reminders.integration.test.mjs` →緑。通知クリックで既読になり対象月へ遷移することをブラウザー確認する。既存board/title通知の導線不変も確認する。
- [ ] 上記6ファイルをステージし、`feat: notify students once about unsubmitted monthly mocks` でコミットする。

## Task 14: 教師の模擬試験状況画面

**Files:** Create `src/lib/teacher/mock-exams.ts`, `src/app/api/teacher/mock-exams/route.ts`, `src/app/teacher/mock-exams/page.tsx`, `mock-exam-status.tsx`, `tests/teacher-mock-exams.test.mjs`; Modify `src/components/role-shell.tsx:9`, `tests/teacher-shell.test.mjs`。
**Interfaces:** `getTeacherMockExams(db,actor:MockActor,input:{examCode:ExamCode;month:MonthKey;cursor:string|null}):Promise<TeacherMockView>`。`TeacherMockView` は開催情報・対象学生数・3状態別人数・学生行（userId/name/status/attempt1Score/attempt2Score/bestScore/rankNo）・nextCursorを同ファイルで定義する。

- [ ] teacherだけ成功、student/停止teacher拒否、未開始/受験中/提出の3分類、2回分と最高点、月/試験分離、100人ページの件数集計と行件数をテストする。
  ```js
  test('teacher navigation has mocks but not student account features', () => {
    const source=readFileSync('src/components/role-shell.tsx','utf8');
    assert.ok(source.includes('/teacher/mock-exams')); assert.equal(source.includes('href="/profile"'),false);
  });
  ```
- [ ] `UNIT tests/teacher-mock-exams.test.mjs tests/teacher-shell.test.mjs` →赤。
- [ ] 既存teacher guardとRoleShellを使い、試験/月選択・人数・各学生結果を読み取り専用で追加する。新アイコンは既存SVG方式のexam、管理者名/フォントを維持。手動出題・採点変更・回数追加・教師称号/マイページを設けず、学生用startを教師へ流用しない。
- [ ] 同UNITを緑にし、専用DBの教師/学生それぞれで直URL・API・戻る操作とPC/375px表示を確認する。
- [ ] 上記7ファイルをステージし、`feat: add read-only teacher monthly mock monitoring` でコミットする。

## Task 15: 実行権付きジョブと短期HMAC認証

**Files:** Create `src/lib/mock-exams/job-auth.ts`, `jobs.ts`, `src/app/api/internal/mock-exams/tick/route.ts`, `tests/mock-job-auth.test.mjs`, `tests/mock-jobs.integration.test.mjs`; Modify `scripts/test-environment.mjs:45`, `tests/test-environment.test.mjs`。
**Interfaces:** `verifyMockJobRequest(request:Request,config:{secret:string;projectRef:string;environment:'test'|'production'},now:Date):Promise<{nonce:string}>`; `runMockJobs(db,clock?:MockClock):Promise<{processed:number;failed:number;remaining:boolean}>`。endpointは認証→nonce消費→jobsEnabled確認→runの順。

- [ ] timestamp±60秒、body/path/method/project/environment改ざん、同nonce再送、通常ログインのみ、別test/prodキーを拒否する。test起動時に通常env由来の全 `KAKOMON_MOCK_` と署名secretが消え、専用ファイルから許可した値だけ渡ることをassertする。
  ```js
  test('ambient production mock settings never enter a test child', () => {
    const env=environment.buildTestProcessEnv(valid(),{KAKOMON_MOCK_JOB_SECRET:'production-secret',KAKOMON_MOCK_JOBS_ENABLED:'true'});
    assert.equal(env.KAKOMON_MOCK_JOB_SECRET,''); assert.equal(env.KAKOMON_MOCK_JOBS_ENABLED,'');
  });
  ```
  `environment` と `valid()` は既存test-environmentテストのimport/有効fixtureを使う。実DBではlease失効後の再取得と、失効済みworkerが新leaseのcursor/完了を上書きできないことをassertする（Review Focus 5）。
- [ ] `UNIT tests/mock-job-auth.test.mjs tests/test-environment.test.mjs` →赤。
- [ ] HMAC-SHA256のcanonical文字列を `POST\n/api/internal/mock-exams/tick\nprojectRef\nenvironment\nunixSeconds\nnonce\nsha256(rawBody)`、bodyは `{"action":"tick"}`、署名hexとする。比較は定時間、headersは `x-mock-time, x-mock-nonce, x-mock-project, x-mock-environment, x-mock-signature`。秘密は `KAKOMON_MOCK_JOB_SECRET`、環境は `KAKOMON_MOCK_ENVIRONMENT=test|production` をprojectと照合する。テスト起動では専用envの許可済みmock設定だけ渡し、継承した全mock設定を消す。nonceはjobKey uniqueで消費する。実行権120秒＋leaseTokenでfencing、worker25秒予算、採点/配布25件・通知100件、失敗後1/5/15/60分でretry、以後60分まで。DB時刻と進捗で期限切れ採点→未作成prepare→通知→確定/配布を選ぶ。初回1～24日は当月、25日以降は翌月も準備し、過去月を作らない。ログに秘密・正解・学生情報を出さない。
- [ ] 同UNITと `DB tests/mock-jobs.integration.test.mjs` →緑。途中停止→lease失効→再開、同時tick、遅延20/25日、future月再抽選なし、HTTP成功だが残件ありの区別を確認する。app詳細errorは30日で消去しcompletedAt/business keyを保持、dispatch nonceは有効期間後に整理する。
- [ ] 上記7ファイルをステージし、`feat: orchestrate resumable mock jobs with signed requests` でコミットする。

## Task 16: Supabase Cronの安全な呼出しと停止手順

**Files:** Create `supabase/migrations/20261016010000_mock_exam_scheduler.sql`, `tests/mock-cron-sql.test.mjs`, `docs/operations/monthly-mock-exams.md`。
**Interfaces:** 非公開schema `mock_exam_private` の引数なし `dispatch_tick()` が固定URL/path/bodyで署名しpg_netへ送る。秘密名 `mock_exam_job_secret`、呼出しURL・project・環境は別のVault設定。任意payloadやURLを渡せる署名oracleは作らない。

- [ ] SQLの固定search_path、PUBLIC/anon/authenticatedからschema/function/Vaultアクセス不可、永続keyをHTTP headerへ載せないこと、job未登録の既定状態をassertする。
  ```js
  test('scheduler migration cannot silently start production jobs', () => {
    const sql=readFileSync(new URL('../supabase/migrations/20261016010000_mock_exam_scheduler.sql',import.meta.url),'utf8');
    assert.match(sql,/REVOKE/); assert.match(sql,/hmac/i); assert.doesNotMatch(sql,/cron\.schedule\s*\(/i);
    assert.doesNotMatch(sql,/service_role|sb_secret_/i);
  });
  ```
- [ ] `UNIT tests/mock-cron-sql.test.mjs` →赤。
- [ ] 必要なpg_cron/pg_netを利用可能にするSQLと非公開署名関数だけを用意する。job登録 `* * * * *` は運用書に分離し、別承認後のみ行う。SQLとNodeのcanonical署名の一致、期限切れqueued要求拒否、秘密非露出を専用DBで確認する。cron.run_detailsは登録したjobidだけ7日超を削除する専用cleanup関数にし、他jobは触らない。
- [ ] 同UNITを緑にする。運用書へテストから本番への接続先確認・バックアップ・migration順・3停止スイッチ・秘密別保管/rotation・Cron登録/停止・既存データ保持rollback・失敗/残件監視・無料枠40,320/43,200/44,640回とVercel使用量確認を記載する。ローカル127.0.0.1はSupabaseから到達不可のため、実HTTP予約実行は到達可能なテスト配備先の承認後に行い、未実施なら明記する（Review Focus 5）。
- [ ] 上記3ファイルをステージし、`feat: prepare private Supabase mock exam scheduling` でコミットする。ここでは本番Cronを開始しない。

## Task 17: 全体回帰・受け入れ・公開判断

**Files:** Create `tests/mock-end-to-end.integration.test.mjs`, `docs/operations/monthly-mock-exam-verification.md`。検証用コピーはGit対象外の `output/mock-exam-verification/<runId>/` に作成する。
**Interfaces:** 新機能interfaceは増やさない。Task 1～16のサービス・HTTP・UIを同じfixtureと仮想時計で通す。

- [ ] 一連の受け入れtestを書く。両試験初回＋2回目→best更新→20日通知対象確認→25日自動採点→1/1/3確定→配布失敗→再開→称号手動購入→過去月表示を確認する。
  ```js
  assert.equal(participationLedgerTotal,40);
  assert.deepEqual(finalRankNumbers,[1,1,3]);
  assert.deepEqual(finalRewards,[150,150,75]);
  assert.equal(duplicateRewardLedgerCount,0);
  assert.equal(unwantedPracticeCountIncrement,0);
  assert.equal(duplicateTitleNoticeCount,0);
  ```
  各変数は同test内でfixtureのPrisma行から求める。元データ変更、他学生ID/教師/停止、締切前API・RSC漏えい、写真/称号変更後の順位固定も含める。
- [ ] `DB tests/mock-end-to-end.integration.test.mjs` で赤になれば原因の所有Taskへ戻す。新しく発見したバグは再現testを先に追加し、仕様変更が必要なら確認する。
- [ ] 専用DB＋ローカル3001で全経路をPC・375px幅で実操作する。実ブラウザーskill・React best practices・検証skillを使い、元の練習・掲示板・通知・プロフィール・アイコン・称号ショップの回帰も実行する。検証記録は日時・commit・test project・実行コマンド・pass/fail/skip・画面証跡・未実施項目を分ける。
- [ ] `node --import ./tests/helpers/register-title-tests.mjs --test tests/*.test.mjs`、`npm run lint`、`npm run typecheck`、全mock実DBtestを実行する。`git archive HEAD`を検証コピーに展開し、必要なローカル機能差分のみをコピー、node_modulesを再利用して同コピー内で `npm run build` を実行する。依存追加や本番データ変更はしない。原本20ファイルの保護済み差分が維持され、無関係なseed/JSONを含まないことを再確認する。
- [ ] 検証記録・E2Eだけをステージし、`test: verify monthly mocks rankings and recovery paths` でコミットする。最終reviewを行い、未実施の実HTTP Cronがあれば「全体運用確認済み」とはしない。ユーザーへ結果と残リスクを提示し、バックアップ→本番追加SQL→Vercel停止設定/秘密→pushとデプロイ→接続先・署名HTTP確認→当月/翌月prepare→新規開始/Cron段階有効化を個別確認する。コードを戻しても確定順位・配布済pointsを自動削除しない。

## 計画セルフレビューと実行開始条件

仕様1～2はTask 1・4～6・10～13、画面3はTask 9・10・14、DB/出題4～5はTask 2～3、競合6はTask 4～7・9、確定7はTask 10～12、Cron8はTask 15～16、権限9はTask 7・14～15、境界10はTask 4・11、移行11は共通ゲート・Task 2・16～17、検証12は各TaskとTask 17で受け持つ。5件のReview Focusはいずれも所有Task内の明示testに割り当てた。

この計画は機能コード・DB未変更の状態でレビューする。ユーザーが計画を確認し、同一セッションで本人が順に実装するNative方式か、Taskごとに実装者とreviewerを分けるSubagent-driven方式かを選択してからTask 1を開始する。DB適用や本番操作の承認範囲は、そのときの明示指示で記録する。
