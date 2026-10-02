# 称号条件・永久アンロック Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 確定した66種類の称号を既存データを保護して登録し、ランキング以外の条件判定・永久アンロック・0ポイント購入・通知を実装する。

**Architecture:** 条件定義、純粋な判定、実績取得、永続アンロック、回答記録、利用記録、購入を分離する。購入済みの `UserTitle` は保持し、新しい `UserTitleUnlock` を永久購入資格の正本とする。既存履歴の遡及と新規イベントの判定は共通の条件関数を使用する。

**Tech Stack:** Next.js 16.2.9 App Router、React 19.2.4、TypeScript、Tailwind CSS 4、Prisma 7.8、Supabase PostgreSQL、Node.js 24標準テスト。

**Spec:** `docs/superpowers/specs/2026-10-01-title-conditions-design.md`

## Global Constraints

- 「購入条件未達成」「ポイント不足」を使用する。購入確認あり、購入後の自動装備なし。
- 同じ問題への繰り返しも数えるが、同一回答の再送は数えない。
- 日・月の区切りは `Asia/Tokyo`。日時と利用者はサーバー側で決定する。
- 条件達成通知はユーザー・称号につき1回。教師には称号機能を提供しない。
- `DATABASE_URL` はアプリ実行用のTransaction mode、`DIRECT_URL` はPrisma CLI用。秘密値を出力しない。
- Supabaseの既存DB・既存データ・適用済みマイグレーションを削除または初期化しない。`DROP`、`TRUNCATE`、`DELETE FROM`、`prisma db push`、`migrate reset` は使わない。
- パッケージ・依存関係を追加しない。認証方式、教師権限、問題画像、既存ポイント付与ルールを変更しない。ランダム回答のポイントは0のまま。
- ランキング本体とランキング称号の実アンロック、模擬試験、画像アップロード、復習は別計画。
- `AGENTS.md` の文字コード規則を守る。既存ファイルはUTF-8/BOMなし/CRLFが多いが、混在改行のファイルもある。改行を一括変換しない。
- 実装開始前にこの計画を確認してもらう。実行方法は、この対話で担当者が順番に進める方式を維持する。commitは対象ファイルだけ、pushは依頼時のみ。

## Review Focus

1. 達成後の失敗・途中終了・日付変更でも永久購入資格を消さない。Task 3・4で最大履歴と再判定を検証。
2. 学習の繰り返しと通信の重複を区別する。Task 5・7で再送・同時実行・別出題の同一問題を検証。
3. 記録のない過去を「利用なし」「回答なし」と扱わない。Task 3・4・6で未観測日と閉じた日を検証。
4. 所有とアンロックを混同しない。Task 3・7・8で58種類固定、20種類、購入未達成、装備維持を検証。
5. プリフェッチ、Strict Mode、複数タブ、非表示ポーリングで往復・利用を水増ししない。Task 6・8で重複・順序・実表示を検証。

---

## 現状とファイル分担

作業開始時のブランチは `main`、HEADは `6fe09d1`。既存のPrisma生成物変更と未追跡 `.superpowers/` は保持する。2026-09-02の引継ぎ資料は当時の状態であり、現在はショップ・掲示板・教師・通知まで実装済み。

現在 `/titles` と購入APIは価格が正の称号だけを扱う。ランダムAPIは回答を保存しない。過去問のfinishは途中終了でも `completed` を保存する。学生プロフィールの累計は主に過去問練習の終了時に更新されるため、全モード称号の正本にはしない。

| 新規ファイル | 責務 |
| --- | --- |
| `src/lib/titles/catalog.ts` | 固定キー・66種類・条件定義・固定58キー集合 |
| `src/lib/titles/contract.ts` | 条件、実績、ショップ状態、サービス入出力の型 |
| `src/lib/titles/rules.ts` | DBに依存しない閾値・連続条件の判定 |
| `src/lib/titles/facts.ts` | Prismaによる集計と利用記録の観測範囲管理 |
| `src/lib/titles/unlocks.ts` | 重複防止、通知、遡及判定、ユーザーロック |
| `src/lib/titles/random-attempts.ts` | 出題IDの発行と1回限りの回答保存 |
| `src/lib/titles/activity.ts` | 日別利用・回答有無・往復の永続状態 |
| `src/lib/titles/purchase.ts` | 購入可能判定・原子的な購入 |
| `src/app/api/titles/activity/route.ts` | 認証学生の実表示・利用イベント受付 |
| `src/components/title-activity-tracker.tsx` | 実表示・日付変更後の利用と移動の送信 |
| `supabase/migrations/20261001000000_title_conditions.sql` | 追加テーブル・列・制約・66称号の同期 |
| `tests/fixtures/title-facts.mjs` | 仮想日付・回答・セッション・実績のテスト生成 |
| `tests/helpers/register-title-tests.mjs` | TypeScriptと既存エイリアスをNodeテストで読み込む補助 |

既存のAPI、`title-shop.tsx`、`student-shell.tsx`、`starter-title.ts`、通知のcontract/read/writeは各タスクで必要箇所だけ変更する。大きな画面再設計はしない。

## DB追加案

| 対象 | 主な列・制約 |
| --- | --- |
| `titles` | `catalog_key` nullable unique、`acquisition_kind` nullable。既存の価格・IDを利用。条件本体は型付きカタログで管理 |
| `student_profiles` | `title_backfilled_at` nullable、`title_tracking_started_at` nullable。既存の累計・ポイントは流用・改変しない |
| `user_title_unlocks` | `user_id`, `title_id`, `unlocked_at`, `source`。unique(user_id,title_id)、FKとtitle_id索引 |
| `random_quiz_attempts` | `id`, `user_id`, `question_id`, `issued_at`, nullableな選択肢・正誤・回答日・回答日時・answer_sequence。unique(user_id,answer_sequence)、user/date/sequence索引、FK索引 |
| `student_activity_days` | `user_id`, `activity_date`, `has_answered`, `first_seen_at`, `last_seen_at`。複合主キー(user_id,activity_date) |
| `student_navigation_progress` | `user_id`, `tab_id`, `last_sequence`, `stage`, `round_trips`。複合主キー(user_id,tab_id)、非負回数・状態制約 |

新規4テーブルはRLSを有効にし、anon/authenticatedから直接書かせない。アプリはサーバーのPrisma接続経由。初期付与・旧所有・装備・通知は保持する。同名称号はIDを変えずにupsertし、旧カタログだけの称号は削除せず新販売一覧から除外する。

ランダムは未回答の出題行をGETで作成し、POSTで回答済みに更新する。1回の出題IDには1回の回答だけ。同じ問題を再出題した別IDには再び回答できる。回答順はユーザー単位のロック下で採番し、ミリ秒の同時刻やランダムUUID順に連続正解を依存させない。

## 共通インターフェース

`contract.ts` に次を定義する。Dateを外部JSONに直接渡さず、ショップ表示にはシリアライズした値を渡す。

- `TitleDefinition`: `key`, `name`, `pricePoints`, `acquisitionKind: 'starter' | 'points' | 'condition'`, `condition: TitleCondition | null`, `implemented: boolean`。
- `TitleCondition`: `answer_count`, `category_correct`, `daily_answer_run`, `daily_incorrect_run`, `practice_first_complete`, `practice_result`, `practice_perfect_run`, `random_correct_run`, `activity_run`, `no_answer_activity_run`, `answer_run_then_break`, `return_gap`, `navigation_round_trips`, `owned_count`, `owned_set`, `name_changed`, `monthly_rank`, `monthly_rank_count`, `monthly_top_run` の判別可能なunion。必要数・分野コード・順位・固定キー集合を各型の値として持つ。
- `TitleFacts`: `answerCount`, `categoryCorrect: Record<'technology' | 'management' | 'strategy', number>`, `dailyAnswerMaxRun`, `dailyIncorrectMaxRun`, `hasCompletedPractice`, `hasPerfect60`, `hasZero60`, `perfectPracticeMaxRun`, `randomCorrectMaxRun`, `activityMaxRun`, `noAnswerActivityMaxRun`, `hasAnswerRunThenBreak`, `returnGapMaxDays`, `navigationRoundTrips`, `boardPostCount`, `boardCommentCount`, `ownedCountExcludingCollector`, `ownedKeys: string[]`, `nameChanged`。掲示板は独立した `board_post_count` / `board_comment_count` 条件としてunionにも加える。
- `UnlockContext`: `{ now: Date; displayNameChanged?: boolean; source: 'backfill' | 'event' }`。
- `UnlockSummary`: `{ newlyUnlockedKeys: string[] }`。
- `TitleShopItem`: `{ id, key, name, pricePoints, conditionText, owned, state: 'starter' | 'owned' | 'locked' | 'available' | 'insufficient', implemented }`。
- `ActivityInput`: `{ now: Date; hasAnswered?: boolean; navigation?: { tabId: string; sequence: number; path: string } }`。日付・利用者・回数はクライアントから受け取らない。

### Task 1: カタログ・追加マイグレーションの準備

**Files:** Create: `catalog.ts`, `contract.ts`, 上記SQL。Modify: `prisma/schema.prisma`, `src/lib/starter-title.ts`。Test: `tests/title-catalog.test.mjs`, `tests/title-schema.test.mjs`。

**Interfaces:** `TITLE_CATALOG: readonly TitleDefinition[]`, `COMPLETE_COLLECTION_V1_KEYS: readonly string[]`。初期称号キーは `v1-014`。既存の `ensureStarterTitleForStudent(tx,userId)` を維持し、新しい方式と固定キーを補完する。

- [ ] **Step 1: failing testsを作成する。** `catalog_counts`: `assert.equal(TITLE_CATALOG.length,66)`、価格購入33、初期1、条件32、未実装ランキング7を検証。`collection_is_frozen`: `assert.equal(COMPLETE_COLLECTION_V1_KEYS.length,58)` と仕様の除外8キーを検証。`migration_is_additive`: 新規4テーブル、RLS4件、ユニーク制約、回答前/後のnullable整合、負価格拒否、破壊的SQLなしを検証。`legacy_ids_survive`: 同名upsertが既存ID・UserTitleを更新/削除しないことを検証。
- [ ] **Step 2: REDを確認する。** `node --test tests/title-catalog.test.mjs tests/title-schema.test.mjs`。未定義カタログ/SQLでFAILすること。
- [ ] **Step 3: 固定66件と追加DDL・DMLを作成する。** 価格と名称はSpec表、条件の定数は対話後の値を使う。条件価格0、ポイント価格>0を検証。既存行の方式は未知ならnullableのまま保持。SQLの同名競合はIDを保持し、固定キー衝突は安全に失敗させる。ランキング定義はimplemented=false。
- [ ] **Step 4: GREEN・型を確認する。** 上記テストと `npx prisma validate`。後者はDIRECT_URLが存在する環境で実行し、値を出力しない。Prisma生成はschema変更時だけ実行し、元からある改行差分と新しい意味差分を分けて確認する。
- [ ] **Step 5: このタスクだけcommitする。** `feat: define title catalog and additive unlock schema`。既存の無関係な生成物変更・`.superpowers/`は含めない。

### Task 2: 既存データを保持してDBへ反映

**Files:** Task 1のSQL、Specの適用結果欄。Test: `tests/title-schema.test.mjs`。

**Interfaces:** Task 1の4テーブル・追加列・66件がサーバーのPrismaから利用可能になる。アプリコードのデプロイ前に反映する。

- [ ] **Step 1: 接続先と現状を読み取り確認する。** Supabase MCPでプロジェクト・適用済み履歴・既存称号名/ID・主要テーブル件数を取得する。秘密URLは出さず、同名称号の価格変更と旧称号保持をユーザーへ提示する。
- [ ] **Step 2: 適用の権限を確認する。** この新規マイグレーションを含むユーザー承認が得られている場合に進める。接続先・対象変更が承認範囲から外れる場合のみ追加確認する。計画作成への承認だけでは実DBへ適用しない。
- [ ] **Step 3: 新規SQLを1件適用する。** Supabase MCPのmigration適用を使用する。既存マイグレーションとPrisma migration履歴を勝手に作り直さない。
- [ ] **Step 4: 適用後をSELECTで確認する。** 66キー、所有・装備の参照先ID維持、ユーザー・問題・回答・ポイント履歴件数の非減少、新4テーブルの制約/RLSを確認。通常利用による増加を削除と誤判定しない。
- [ ] **Step 5: 秘密値を含めず結果を記録してcommitする。** `docs: record title schema deployment checks`。失敗時は原因を報告し、resetや古いSQLの書換えをしない。

### Task 3: 純粋な条件判定と境界テスト

**Files:** Create: `src/lib/titles/rules.ts`, `tests/fixtures/title-facts.mjs`, `tests/title-rules.test.mjs`。

**Interfaces:** `evaluateTitleRules(facts: TitleFacts, definitions: readonly TitleDefinition[]): string[]`; `maxDateRun(dates: readonly string[]): number`; `maxPerfectPracticeRun(sessions: readonly { questionCount:number; answeredCount:number; correctCount:number }[]): number`; `maxRandomCorrectRun(answers: readonly { answerDate:string; isCorrect:boolean }[]): number`。入力は保存順・終了順に並べて渡す。テストfixtureは `makeTitleFacts(overrides = {})` で全ゼロ実績を生成する。

- [ ] **Step 1: 条件のfailing testsを作成する。** 下記の境界をtable-driven testにする。
  - `perfect_practice_threshold`: 完走30/60/30全問正解で最大3、2回では未達成、部分回答や1問不正解を挟むとリセット。
  - `historical_max_is_permanent_candidate`: 過去の3連続後に失敗しても最大3。30/100日回答、5日不正解も現在値ではなく最大値を使う。
  - `all_modes_repeat_counts`: 同問題の別回答を含む合計999/1000、分野299/300を境界判定。
  - `random_boundaries`: 同日49/50、99/100、149/150、199/200。不正解と日付変更で切れる。
  - `activity_boundaries`: 364/365日、13/14日、利用+回答2/3日後の欠落、閉じた無回答利用4/5日。
  - `ownership_boundaries`: 所有19/20、固定対象57/58。未購入アンロックは不算入。将来・ランキング・旧称号だけで58条件を埋めない。
  - `other_boundaries`: 往復4/5、投稿9/10、返信9/10、同名false/変更true、60問0正解/60正解、30問は60条件対象外。ランキングは事実があっても無効。
- [ ] **Step 2: REDを確認する。** `node --test tests/title-rules.test.mjs`。未定義関数でFAILすること。
- [ ] **Step 3: 上記関数を実装する。** 純粋関数とtype-only importを基本にし、日付はJST日付文字列として比較する。定義に実装済みフラグがない条件を評価しない。
- [ ] **Step 4: GREENを確認する。** 上記テストとTask 1のカタログテストがPASSすること。
- [ ] **Step 5: commitする。** `feat: evaluate title conditions from immutable facts`。

### Task 4: 実績取得・遡及・永久アンロック・通知

**Files:** Create: `facts.ts`, `unlocks.ts`, `tests/helpers/register-title-tests.mjs`, `tests/title-unlocks.test.mjs`, `tests/title-facts.test.mjs`。Modify: `src/lib/notifications/write.ts`, `contract.ts`, `tests/notifications-contract.test.mjs`（通知側）。

**Interfaces:** `collectTitleFacts(tx: Prisma.TransactionClient,userId:string,now:Date): Promise<TitleFacts>`; `lockTitleOwner(tx,userId): Promise<void>`; `syncTitleUnlocks(tx,userId,context:UnlockContext): Promise<UnlockSummary>`; `backfillTitleUnlocks(prisma:PrismaClient,userId:string,now:Date): Promise<UnlockSummary>`; `createTitleUnlockNotifications(tx,userId,titleIds:readonly string[]): Promise<number>`。

- [ ] **Step 1: 永続化・実績取得のfailing testsを作成する。** `facts_use_saved_answers_not_profile_totals` は3モード回答合計と進行中/途中終了回答を含むこと。`deleted_board_rows_count` はdeletedAt付きも含むこと。`unobserved_is_not_absence` は古いlastLoginAtや欠落日からログインマン/レアキャラを付与しないこと。`answer_days_prove_use` は実回答日の365日を肯定的な利用判定に使うこと。`unlock_once` は二度のsyncでunlock/通知各1件、元の日時維持。`rollback_is_atomic` は通知保存失敗でunlockもrollback。`owned_is_not_notified` は既所有・初期・教師を除外。`backfill_marker_after_success` は途中失敗で完了マーカーを立てないこと。
- [ ] **Step 2: REDを確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/title-facts.test.mjs tests/title-unlocks.test.mjs`。補助は既存TypeScriptのtranspileModuleとNode registerHooksを用い、@/と拡張子なしのローカルTSを解決する。新パッケージは不要。
- [ ] **Step 3: 事実取得と保存を実装する。** user行→studentProfile→各対象行の順でロックを統一する。全モードは回答テーブルからまとめて集計し、N+1で称号ごとに同じ履歴を読まない。所有件数・削除済み掲示板件数・日付順履歴を取得する。名前変更はcontextの実際の変更だけを使う。永久資格と通知を同じtransaction内でunique/createMany(skipDuplicates)により保存する。
- [ ] **Step 4: 初回ショップ用backfillを実装する。** 初回は全既存履歴から最大記録を調べ、正常終了時にtitleBackfilledAtを保存する。未知の否定条件を推定しない。以後は新規イベントのsyncを利用し、失敗・再読み込みで達成済み資格を消さない。
- [ ] **Step 5: GREENを確認する。** 上記2テストと `node --test tests/notifications-contract.test.mjs tests/notification-emission-rules.test.mjs` がPASS。通知文をSpecどおり変更し、既存返信・ピン通知を維持する。
- [ ] **Step 6: commitする。** `feat: persist title unlocks and retrospective notifications`。

### Task 5: ランダム回答保存と学習イベント連携

**Files:** Create: `random-attempts.ts`, `tests/title-answer-events.test.mjs`, `tests/random-attempts.test.mjs`。Modify: `src/app/api/random-quiz/route.ts`, `src/app/random-quiz/page.tsx`, `src/app/api/daily-qa/answer/route.ts`, `src/app/api/practice/sessions/[sessionId]/answer/route.ts`, `src/app/api/practice/sessions/[sessionId]/finish/route.ts`。

**Interfaces:** `issueRandomAttempt(tx,userId,questionId,now): Promise<{attemptId:string}>`; `saveRandomAnswer(tx,userId,value:{attemptId:string;selectedChoiceId:string},now): Promise<{alreadyAnswered:boolean;questionId:string;selectedChoiceId:string;isCorrect:boolean}>`。`syncTitleUnlocks` はTask 4を使用。利用日の回答あり更新は `studentActivityDay` の原子的なupsertとしてこのタスクから行い、Task 6の共通関数へまとめる。

- [ ] **Step 1: 回答イベントのfailing testsを作成する。** `same_attempt_replay` は同一IDの再送で保存1件・連続数1、異なる選択肢再送でも元の回答を返す。`repeat_question_new_attempt` は同問題別IDを2件計上。`foreign_attempt` は他学生IDを拒否。`invalid_choice` は出題と違う選択肢を拒否。`concurrent_attempt_answers` は確定順を一意にし、一方の不正解がリセットに反映。`practice_answer_vs_finish` は同時回答/finishで終了後回答・二重ポイントを発生させない。`finish_replay` は既完了再送で条件・ポイントを増やさない。`paused_not_finished` は画面離脱だけで3連続をリセットしない。
- [ ] **Step 2: REDを確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/random-attempts.test.mjs tests/title-answer-events.test.mjs`。
- [ ] **Step 3: GET/POSTとクライアントを更新する。** GETはquestionとattemptIdを返す。クライアントは出題とIDを一緒に保持し、再送に同じIDを使う。POSTは所有・選択肢を確認し、サーバーで正誤決定、回答保存・回答日記録・syncを同一transactionで行う。教師には既存正誤判定を維持して学生の称号・利用記録を作らない。
- [ ] **Step 4: 一問一答・練習へのhookを追加する。** 正常な新回答後に全モード累計判定、一問一答の連続判定、終了後に完走と3連続判定。既存の回答再送ガードを維持する。練習answer/finishはuser→profile→sessionロック下で最新状態を再確認し、同一終了の二重加算を防ぐ。既存ポイント数・日次上限の仕様は変えない。
- [ ] **Step 5: GREENと型を確認する。** 上記テストと `npm run typecheck` がPASS。JST 23:59/00:00、画面更新をテストする。
- [ ] **Step 6: commitする。** `feat: record quiz attempts and evaluate learning titles`。

### Task 6: 日別利用・往復・名前・掲示板イベント

**Files:** Create: `activity.ts`, `src/app/api/titles/activity/route.ts`, `src/components/title-activity-tracker.tsx`, `tests/title-activity.test.mjs`, `tests/title-community-events.test.mjs`。Modify: `src/components/student-shell.tsx`, `src/app/api/profile/route.ts`, `src/lib/board/write-posts.ts`, `src/lib/board/write-comments.ts`、Task 5の日別回答更新。

**Interfaces:** `recordTitleActivity(tx,userId,input:ActivityInput): Promise<void>`; `advanceNavigation(state:{lastSequence:number;stage:'idle'|'home'|'profile';roundTrips:number},visit:{sequence:number;path:string}): {lastSequence:number;stage:'idle'|'home'|'profile';roundTrips:number}`。Activity APIは認証された学生だけに `{date:string}` を返す。TrackerはStudentShellに1つ配置。

- [ ] **Step 1: 利用・移動のfailing testsを作成する。** `navigation_five_round_trips` は /→/profile→/ を5回で合計5。`reload_same_path`、`duplicate_sequence`、`out_of_order_sequence`、`strict_mode_repeat` は追加0。別画面を挟んだ半往復は0。`different_tabs` は別tabIdの成立分だけ合計。`closed_no_answer_days` は5日目の当日中に未達成、日付変更後達成、遅い同日回答で未達成。`same_day_replay` は利用日1行。`return_gap` は前日更新前に13/14日を判定。`unknown_partial_day` は未観測の記録初日を無回答日と扱わない。`three_day_break` と `activity365` は仮想履歴で検証。
- [ ] **Step 2: 名前・掲示板のfailing testsを作成する。** `same_name_and_bio_only` は未達成、`first_real_name_change` は1回だけ達成。`self_reply_counts` は10件で達成するが返信通知は0。`deleted_posts_keep_count` は削除後も10。`teacher_events` は称号を作らず、通常の投稿機能を維持。
- [ ] **Step 3: REDを確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/title-activity.test.mjs tests/title-community-events.test.mjs`。
- [ ] **Step 4: 日別記録とTrackerを実装する。** サーバーでnowと認証IDを確定。現在日upsert前に過去日/空白を評価する。hasAnsweredはtrueからfalseに戻さない。名前・投稿・返信保存も利用実績を記録する。初回実表示、pathname変更、可視状態復帰、日付変更後の実際の入力で送信し、非表示ポーリングとprefetchでは送信しない。tabId/sequenceを保持し、再送は同じsequence、Strict Modeとリクエスト逆転を水増しにしない。5往復達成後は不要な往復記録を停止してよい。
- [ ] **Step 5: 成功した名前変更・掲示板保存とsyncを同一transactionにまとめる。** 名前はロック後に保存前値と比較。投稿・返信件数はdeletedAtで除外せず自己返信も含める。別人への従来返信通知は維持する。
- [ ] **Step 6: GREENと回帰を確認する。** 上記テスト、既存board/notificationテスト、`npm run typecheck` がPASS。
- [ ] **Step 7: commitする。** `feat: track activity and community title conditions`。

### Task 7: 条件を強制する0ポイント・有料購入

**Files:** Create: `purchase.ts`, `tests/title-purchase.test.mjs`。Modify: `src/app/api/titles/purchase/route.ts`。

**Interfaces:** `purchaseTitle(tx,userId,titleId,now): Promise<{title:{id:string;name:string};totalPoints:number;purchasedAt:Date}>`。エラーは `unavailable`, `locked`, `owned`, `insufficient` を識別可能なクラス/コードで返す。APIは unavailable=404、locked=403、owned/insufficient=409、未認証401・教師403を維持する。

- [ ] **Step 1: failing testsを作成する。** `locked_direct_api` は拒否、`free_unlocked` は残高/装備不変・所有1件・ポイント消費履歴0件。`paid_exact_balance` は残高0まで購入、`paid_short_balance` はrollback。`double_purchase` は同時2件でも所有1・引落1、異なる称号の同時購入でも残高非負。`unlock_after_twentieth_purchase`、`unlock_after_fifty_eighth_required_purchase` は新しい資格だけを作り、自動所有しない。失敗した購入で資格/通知を残さない。
- [ ] **Step 2: REDを確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/title-purchase.test.mjs`。
- [ ] **Step 3: 購入を実装する。** user→profile→titleの順でロック。active・固定キー・入手方式・永久資格をサーバーで検証。初期付与を直接購入させない。有料だけ残高を減らし既存ポイント履歴を作成、無料はUserTitleだけ作成。所有のuniqueを維持。購入後にTask 4のsyncで所有条件を再判定する。
- [ ] **Step 4: GREENを確認する。** 上記テストと `npm run typecheck` がPASS。実PostgreSQLの同時実行検証はTask 9で別途行い、mockテストだけでDBロック成功とは報告しない。
- [ ] **Step 5: commitする。** `feat: enforce permanent title purchase eligibility`。

### Task 8: 既存ショップの条件表示・確認導線

**Files:** Modify: `src/app/titles/page.tsx`, `src/app/titles/title-shop.tsx`。Create: `tests/title-shop-contract.test.mjs`, `tests/title-shop-render.test.mjs`。

**Interfaces:** サーバーは初回backfill後に `TitleShopItem[]` を作成する。クライアントは条件詳細と購入確認を区別し、購入成功後は再取得して新たな20/58条件アンロックも反映する。

- [ ] **Step 1: failing testsを作成する。** `locked_click_shows_condition`、`free_title_still_confirms`、`owned_precedes_locked`、`insufficient_copy`、`purchase_does_not_equip`、`future_ranking_is_locked` を検証。初期/旧所有が条件未達成を理由に消えないこと、条件詳細に価格を紛らわせないことを検証。
- [ ] **Step 2: REDを確認する。** `node --test tests/title-shop-contract.test.mjs tests/title-shop-render.test.mjs`。
- [ ] **Step 3: server/clientを更新する。** 価格>0フィルターを固定カタログの表示に置換。新たな未達成カードをクリックできるようにし、条件ダイアログにフォーカス移動・Escape・閉じた後のフォーカス復帰を用意する。無料でも購入確認を通す。既存の紺/青/白スタイルと暫定価格の注記を維持する。
- [ ] **Step 4: GREEN・実表示を確認する。** 上記テスト、typecheck、変更ファイルlintを実行。ローカルで未達成詳細、0ポイント購入、有料不足、装備不変、通知からショップ、PC/モバイルを確認する。ブラウザ検証時はfrontend-testing-debuggingスキルを使用する。
- [ ] **Step 5: commitする。** `feat: show title conditions and free unlock purchases`。

### Task 9: 全体回帰・DB整合・引継ぎ

**Files:** Specとplanの結果欄。Test: 既存 `tests/*.test.mjs` と新規称号テスト。

**Interfaces:** ユーザーへ「実装済み」「ランキング待ち」「履歴がないため今後カウント」「未検証」を区別して引き渡す。

- [ ] **Step 1: 受け入れケースを列挙して先に不足テストを追加する。** 365日・200連続・58所有、旧所有維持、過去に3連続達成後の失敗、JST境界、未観測期間、同時再送・購入・finishを確認する。新規4テーブルのRLSとunique制約も確認する。
- [ ] **Step 2: 自動検証を実行する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/*.test.mjs`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check`。すべての出力を確認し、FAILを修正する。
- [ ] **Step 3: DBの同時実行とrollbackを検証する。** 本番Supabaseとは異なる、明示的に指定された専用テストDB/プロジェクトだけで、同一出題の同時回答、同一称号/異なる称号の同時購入、練習answer/finish競合、通知失敗rollbackを行う。未準備ならこの検証は未実施として報告し、本番データで代用しない。
- [ ] **Step 4: ローカルブラウザで学生/教師の回帰確認を行う。** 新規学生の初期装備、既存学生の装備維持、遡及通知の重複なし、未達成API拒否、有料/無料購入、5往復、自己返信、同名保存、ランダム履歴とポイント0、教師の称号非表示を確認する。長期条件は仮想履歴テストを使い、学生履歴を改変しない。
- [ ] **Step 5: 新規文書と変更ファイルの文字コード・日本語を再確認する。** UTF-8 strict decode、BOM、改行、U+FFFD、代表日本語行、意図しない全体差分を確認し、パスごとに報告する。
- [ ] **Step 6: 結果を記録して最終commitする。** `docs: record title feature verification and deferred ranking work`。ランキング7種類は判定待ちのままと明記する。ユーザーからpush依頼があるまでpushしない。

## 計画の自己レビュー

Specの66件、無料/有料/初期、永久資格、全モード反復、最大履歴の遡及、無回答・空白の観測範囲、JST、3連続、20/58所有、自己返信・削除保持、名前変更、教師除外、通知1回を各Taskへ割り当てた。ランキングは定義・未達成表示までとし、別計画に切り出した。新規4テーブルの追加と既存所有の保持を前提にし、破壊的操作・ライブラリ追加・画像機能・広範囲リファクタリングを含めていない。

## 実行結果（2026-10-02）

Task 1〜8実装済み。Task 9の不足テストとしてランダム200連続の実サービス経由ケースを追加、187/187 PASS。typecheck・全体lint・build・対象diff検査PASS、読み取りDB整合とPC/モバイルの確認を実施。実DB競合テストは専用DB未指定で未実施。ブラウザーの購入は確認後取消し、実購入をしたとは扱わない。詳細・文字コードは `../reports/2026-10-02-title-conditions-verification.md`。残りはwhole-branch review、重要指摘を一度の修正工程で検証、引継ぎ。push未実行。
