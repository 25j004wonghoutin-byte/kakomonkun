# 月次模擬試験・ランキング 検証記録

## Task 1 — 2026-10-16

実行方式: ユーザーが選択したNative方式。同じ指定フォルダーの `codex/monthly-mock-exam-ranking` で順に実装する。承認済み計画は `docs/superpowers/plans/2026-10-16-monthly-mock-exam-ranking-implementation.md`。

実装コミット: `cc7d111`。計画書コミット: `92b716f`。ここで完了したのは日程・採点の純粋処理、公開型定義、環境変数の停止・接続先照合だけであり、模擬試験機能全体や画面の完成ではない。

### 実行結果

| 確認 | 結果 |
| --- | --- |
| 実装前の既存suite | 315件中312成功・失敗0・明示opt-inの実DB等3件skip |
| 新規3ファイルのRED | 未実装を示すassertで25件失敗。接続失敗や依存import事故ではない |
| 新規3ファイルのGREEN / task-done再実行 | 25件成功・失敗0・skip 0 |
| 全体suite | 340件中337成功・失敗0・既存の実DB等3件skip |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0、エラー0、既存outputファイルの警告1件 |
| 対象パスとステージ済み差分のwhitespace検査 | 問題なし。既存Prisma生成物の末尾空白は修正・コミット対象外 |
| 保護対象の既存20ファイル | SHA256比較ですべて変更なし |

単体コマンド: `node --import ./tests/helpers/register-title-tests.mjs --test tests/mock-schedule.test.mjs tests/mock-grading.test.mjs tests/mock-environment.test.mjs`。

全体コマンド: `node --import ./tests/helpers/register-title-tests.mjs --test tests/*.test.mjs`。

lint警告の場所は `output/ipa-answer-audit-2026-10-14/db-correction.mjs:162`、未使用変数 `before`。今回の変更に関係しない既存の作業データのため触れていない。

確認した動作はJSTの毎月1日0時公開・20日9時通知予定・25日0時締切、2月/年越し、100問120分/60問90分、締切による受験時間短縮、100点換算と丸め、不正入力拒否、未設定時の完全停止、テスト/本番の接続混在拒否である。これらの純粋処理は既存画面・APIにはまだ接続していない。

### Task 2の読み取り事前確認

`loadTestConfig()` の厳格な接続先検証を通し、Prismaの `SET TRANSACTION READ ONLY` で専用テストDB `grzylombpqmidltnbwhx` だけを確認した。

| テーブル | 件数 |
| --- | ---: |
| mock_exams | 0 |
| mock_exam_questions | 0 |
| mock_attempts | 0 |
| mock_answers | 0 |
| monthly_rankings | 0 |

現時点でschema編集・追加SQL適用・fixture書込みは行っていない。Task 2で予定する固定選択肢/ジョブ記録の新規2テーブル、既存受験/順位/通知構造の変更について、専用テストDBへの適用確認を得てから進める。本番DB・Cron・秘密値・pushは別の承認対象である。

### テキスト形式の検証

以下の各ファイルを保存後にstrict UTF-8で再読し、BOM・CRLF/LF・U+FFFD・行末空白と代表行を確認した。既存の計画書はUTF-8/BOMなし/CRLFを保持し、不足していたコードフェンス3か所だけを補った。

| パス | エンコーディング | BOM | 改行 | 再読結果 / 日本語 |
| --- | --- | --- | --- | --- |
| docs/superpowers/plans/2026-10-16-monthly-mock-exam-ranking-implementation.md | UTF-8保持 | なし | CRLF保持 | 「月次模擬試験・ランキング」など正常 |
| src/lib/mock-exams/contract.ts | UTF-8新規 | なし | CRLF | 「受験中の公開契約」など正常 |
| src/lib/mock-exams/schedule.ts | UTF-8新規 | なし | CRLF | 「試験種別が正しくありません。」など正常 |
| src/lib/mock-exams/grading.ts | UTF-8新規 | なし | CRLF | 「表示用の100点換算」など正常 |
| src/lib/mock-exams/environment.ts | UTF-8新規 | なし | CRLF | 「模擬試験の接続設定を確認してください。」など正常 |
| tests/mock-schedule.test.mjs | UTF-8新規 | なし | CRLF | 英文のみ、正常 |
| tests/mock-grading.test.mjs | UTF-8新規 | なし | CRLF | 英文のみ、正常 |
| tests/mock-environment.test.mjs | UTF-8新規 | なし | CRLF | 英文のみ、正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8新規 | なし | CRLF | 本文の「専用テストDB」など正常 |

進捗台帳とテストログはこの計画専用のGit対象外 `.superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/` に保存する。台帳はUTF-8/BOMなし/CRLF、skillが生成する指示書・ログ・所有マーカーはUTF-8/BOMなしで生成時の形式を保つ。これらは機能コミットへ含めない。

### 未実施

追加スキーマの実DB制約・並行トランザクション・受験API・画面・ランキング・配布・称号・通知・Cronは今後のTaskで検証する。buildはPrismaの既存生成物を保護した検証コピーで後続工程に実施する。未実施項目を単体テスト成功で代替したとは扱わない。

## Task 2 — 2026-10-17

実装コミット: `b917690`。ユーザーの承認後、専用テストDB `grzylombpqmidltnbwhx` だけに `20261016000000_monthly_mock_exams.sql` を適用した。本番DB・Cron・pushは実行していない。

固定問題・選択肢、最大2回の受験、回答リビジョン、同点順位、確定・報酬進捗、通知月とジョブ記録を追加。空の5テーブルをロック・再確認してから同じトランザクション内でDDLと適用履歴を保存した。再実行は履歴照合で `alreadyApplied:true` となり、再DDLを行わない。既存ユーザー・問題・称号・ポイント・通知は変更していない。実DBテストは自作UUIDのfixtureのみ作成・削除する。

| 確認 | 結果 |
| --- | --- |
| RED | 未実装の移行ガード7件、隔離fixture未実装の実DBテストが失敗することを確認 |
| 最終単体・実DBテスト | 15件成功・失敗0・skip 0 |
| 全体suite | 348件中344成功・失敗0・opt-in 4件skip |
| lint / typecheck / Prisma validate | すべてexit 0。lintのみ既存outputの警告1件 |
| ステージ済み差分のwhitespace検査 | 問題なし |
| 元からの変更保護 | 非重複12ファイルはSHA256一致。重複8ファイルは元の空白差分を未ステージで保持。生成物の残差は空白以外なし |

実DBで回数3の拒否、進行中1件制約、空欄回答、別問題の選択肢拒否、元問題編集・元選択肢削除後のsnapshot保持、同率1位と83.33点保存、別人の採用受験拒否、順位を持つ利用者の物理削除拒否、通知の月内重複拒否、旧称号通知の継続、非空移行の変更前拒否、新規2テーブルのRLSとanon/authenticatedの直接書込み拒否を確認した。

最終コマンド: `KAKOMON_RUN_MOCK_DB_QA=1 node --import ./tests/helpers/register-title-tests.mjs --test --test-concurrency=1 tests/mock-schema.test.mjs tests/mock-schema.integration.test.mjs`。

### Task 2 テキスト形式

各ファイルはstrict UTF-8で再読し、BOM・改行・U+FFFDと代表行を確認した。すべてBOMなし。日本語のあるファイルは「専用テストDB」「固定された検証用の解説」「元の問題を更新」などが正常で、生成物の日本語埋込みスキーマも正常。Git適用で既存LFの8件が一時的にCRLFへ変換されたため、次工程を止めて元のLFへ戻し再検証した。下表は復元後の実ファイル形式である。

| パス | エンコーディング / 改行 | 再読結果 |
| --- | --- | --- |
| prisma/schema.prisma | UTF-8保持 / CRLF保持 | 正常 |
| scripts/apply-test-mock-migration.mjs | UTF-8新規 / CRLF | 正常 |
| scripts/lib/mock-migration.mjs | UTF-8新規 / CRLF | 日本語正常 |
| supabase/migrations/20261016000000_monthly_mock_exams.sql | UTF-8新規 / CRLF | 日本語正常 |
| tests/helpers/mock-db.mjs | UTF-8新規 / CRLF | 日本語正常 |
| tests/mock-schema.integration.test.mjs | UTF-8新規 / CRLF | 日本語正常 |
| tests/mock-schema.test.mjs | UTF-8新規 / CRLF | 正常 |
| prisma/generated/browser.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/client.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/commonInputTypes.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/internal/class.ts | UTF-8保持 / LF保持 | 埋込み日本語正常 |
| prisma/generated/internal/prismaNamespace.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/internal/prismaNamespaceBrowser.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/models.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/models/MockAnswer.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/MockAttempt.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/MockExam.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/MockExamChoice.ts | UTF-8新規 / CRLF | 正常 |
| prisma/generated/models/MockExamJobRun.ts | UTF-8新規 / CRLF | 正常 |
| prisma/generated/models/MockExamQuestion.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/MonthlyRanking.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/Notification.ts | UTF-8保持 / LF保持 | 正常 |
| prisma/generated/models/Question.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/QuestionChoice.ts | UTF-8保持 / CRLF保持 | 正常 |
| prisma/generated/models/RandomQuizAttempt.ts | UTF-8保持 / LF保持 | 正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8保持 / CRLF保持 | 日本語正常 |

### Task 2時点の残作業

問題セット準備、採点・受験API、画面、ランキング確定・報酬、称号連携、通知配信、署名ジョブ、Cronと最終受入れはまだ未完了。今回の成功はDBの足場の確認であり、模擬試験機能全体の完成を意味しない。

## Task 3 — 2026-10-17

実装コミット: `39a9f3e`。月・試験ごとのSerializableトランザクションとロックで60問/100問を重複なし抽選し、問題・4択・正解・出典を固定する。一度readyになったセットは再実行でも抽選しない。候補不足や途中失敗では部分公開しない。

配信画像1,180パスのSHA256 manifestを生成し、本番ビルド時に実ファイルと照合する。`node scripts/build-mock-asset-manifest.mjs --check` で確認できる。画像追加時は同じスクリプトの `--write` で更新するが、既存パスの削除・内容上書きは再生成でも拒否する。採用済み画像はパス・内容とも保持し、誤画像の訂正が必要なら別名資産を追加して将来の問題だけを修正する。manifestの手動書換えで検査を迂回しない。

| 確認 | 結果 |
| --- | --- |
| 単体RED→GREEN | 未実装、ビルド検証未接続、日本語画像パス、保持検査の失敗を確認後、7件成功 |
| 実DB | 7件成功。60/100問とも別接続の同時準備が同一ID・順序、候補不足/別試験拒否、途中失敗rollback、固定後の元データ変更不変を確認 |
| 最終task-done | 14件成功・失敗0・skip 0 |
| 全体suite | 356件中351成功・失敗0・opt-in 5件skip |
| 型・lint・差分検査 | typecheck/lint exit 0。既存lint警告1件。対象/staged whitespace問題なし |
| 実登録プールの読み取り専用確認 | テストDBでITパスポート600/631、基本情報1,940/2,000が有効。最初の接続開始タイムアウト後、待機時間明示の再実行は成功 |

実DBテストの候補取得はPrisma query extensionで自作UUID行だけに絞り、既存問題を編集しない。本番コードの試験・公開状態条件はANDのまま維持する。全体suiteで既存の設定テスト1件が関数形式のnext.configに未追従と判明し、同じ出力ディレクトリ検証をawait呼出しに直した。

Prisma内部のrelation読込みがpgへ並行queryを送る非推奨警告をスタックで確認した。現在のpgではテストは成功しているが、将来のpg 9更新前にadapter対応を確認する。依存更新は今回行っていない。

### Task 3 テキスト形式

各ファイルをstrict UTF-8で再読し、BOMなし・CRLF、U+FFFDなし、代表日本語行と差分を確認した。既存2ファイルの形式は保持、新規6ファイルはリポジトリー規約に合わせた。

| パス | エンコーディング / BOM / 改行 | 再読結果 |
| --- | --- | --- |
| next.config.ts | UTF-8保持 / なし / CRLF保持 | 英文、正常 |
| scripts/build-mock-asset-manifest.mjs | UTF-8新規 / なし / CRLF | 「過去に記録したパス」正常 |
| src/lib/mock-exams/question-assets.json | UTF-8新規 / なし / CRLF | 「スクリーンショット」のパス正常 |
| src/lib/mock-exams/question-pool.ts | UTF-8新規 / なし / CRLF | 「有効な問題が不足」正常 |
| src/lib/mock-exams/prepare.ts | UTF-8新規 / なし / CRLF | 「模擬試験を準備」正常 |
| tests/mock-question-pool.test.mjs | UTF-8新規 / なし / CRLF | 「正しい説明はどれか。」正常 |
| tests/mock-prepare.integration.test.mjs | UTF-8新規 / なし / CRLF | 「元データを変更した検証」正常 |
| tests/test-environment.test.mjs | UTF-8保持 / なし / CRLF保持 | 英文、正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8保持 / なし / CRLF保持 | 本文日本語正常 |

Task 4以降の採点・受験・API/UI・順位確定/報酬/称号/通知/Cronと最終受入れは未完了。本番変更・pushは未実施。

## Task 4 — 2026-10-17

実装コミット: `0db4f1f`。試験→利用者→プロフィール→受験の順にロックし、その後のDB時計で締切判定する共通採点を実装した。最終選択のみを固定正解で採点し、回答数・正解数・参加ポイント・台帳・提出状態を同じトランザクションで保存する。過去問練習回数やbackground activityは増やさない。結果DTOは25日0時まで問題別正解・正誤・解説を含めない。

専用テストDBで10件成功、最終task-doneも10件成功・skip 0。独立2接続での同時提出、初回20pt/2回目0pt/両試験40pt、空欄0点、期限超過のmanual/auto競合、元選択肢変更後の固定正解採点、権限/所有者/revision拒否、台帳書込み後の例外による全rollbackを確認した。別接続が実際にブロックされていることをpg_blocking_pidsで観測し、待機中に期限を越えた場合も submittedAt=expiresAt、gradedAt=実処理時刻になる。締切直前/ちょうどの解説公開、未登録解説の代替表示も確認した。

最初の接続待ち失敗はテスト側の既定maxWait=2秒だったため、サービスと同じ10秒に揃えた。ロック観測は統計snapshotを更新する方式に修正し、失敗時もpending処理を待ってからfixtureを削除する。依存内部のpg非推奨警告はTask 3の記録と同じ。

全体suiteは357件中351成功・失敗0・opt-in 6件skip。typecheck/lintはexit 0（既存output警告1件）。対象/staged whitespace検査は正常。以下をstrict UTF-8で再読し、BOMなし・CRLF、U+FFFDなしと代表日本語を確認した。

| パス | エンコーディング / BOM / 改行 | 再読結果 |
| --- | --- | --- |
| src/lib/mock-exams/locks.ts | UTF-8新規 / なし / CRLF | 「有効な学生アカウント」正常 |
| src/lib/mock-exams/read.ts | UTF-8新規 / なし / CRLF | 「解説は未登録です」正常 |
| src/lib/mock-exams/submit.ts | UTF-8新規 / なし / CRLF | 「模擬試験の初回提出報酬」正常 |
| tests/mock-submit.integration.test.mjs | UTF-8新規 / なし / CRLF | 日本語期待値正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8保持 / なし / CRLF保持 | 本文日本語正常 |

受験開始/保存・API/UI・ランキング・確定/配布/称号/通知/ジョブ・最終受入れは後続Task。本番DB変更・pushは行っていない。

## Task 5開始前の設計確認（承認前の記録）

開始IDを受験ごとに1つだけ保存する構造では、別IDで進行中受験を再開した要求を、終了後の再送時に識別できない。例: Aで1回目を作成→Bで同じ受験を再開→提出→Bを再送。このBを新しい操作と誤認すると2回目を消費する。

承認済みの「同じ開始要求は元の受験へ戻す」を守るため、全受理済み開始IDと受験の対応表 `mock_attempt_start_requests` を追加する案を確認した。この確認時点では承認・適用せず停止し、後述の追加承認を得てから実装した。

## Task 5 — 2026-10-17

追加テーブルの専用テストDB適用をユーザーが承認。実装コミットは `73ea4fd`（対応表/移行）と `a4d7732`（開始/再開）。`20261017000000_mock_attempt_start_requests.sql` の追加だけをテストDBへ適用し、再実行は履歴一致で `alreadyApplied:true`。元の受験・開始ID・回答は更新/削除せず、SQLは既存canonical開始IDを対応表へ引き継ぐ。本番DB・pushは未実施。

同一/別開始IDの並行実行でも受験1件を返し、受理済みの全IDを同じトランザクションで記録する。終了後の再送は元の結果へ戻り、期限切れの再開でも勝手に2回目を開始しない。新規操作だけ2回目を作成し、3回目は拒否する。新規開始の停止中も、既知IDの回復は可能。試験→user→profile→attemptのロック後に期限を判定する。

| 確認 | 結果 |
| --- | --- |
| 追加対応表 RED→GREEN | 不存在を実DBで確認後、主キー重複・別利用者/試験へのFK拒否・RLSを確認 |
| 開始/再開 RED→GREEN | 未実装assertの失敗後、別ID再送・2回上限・締切境界・役割/利用停止・新規開始停止・別試験ID再利用・途中失敗rollbackを確認 |
| 実際のロック待ち | pg_blocking_pidsで別接続の待機を観測して25日0時へ時計を進め、受験/対応表が増えないことを確認 |
| 最終task-done | 対応表+開始/再開12件成功・失敗0・skip 0 |
| Task 4回帰と合わせた実DB | 21件成功・失敗0・skip 0 |
| 全体suite | 359件中351成功・失敗0・opt-in 8件skip |
| 型・lint・Prisma validate | exit 0。既存outputのlint警告1件と依存内部pg非推奨警告は残る |
| 保護対象 | 非重複14ファイルはSHA256一致。重複6生成物は元の空白とLFを保持、未ステージの残差は空白のみ |

Prisma生成は同一tsconfig/packageを持つ検証用コピーだけで行い、各hunkの元内容と生成後の意味的一致を確認して最小適用した。新しい複合FK名もSQLと明示的に一致させた。バックアップと比較用スクリプトは可視化ディレクトリーの `mock-task5-1792198310269/` に保管。旧移行SQLの書換え、DBリセット、既存利用者データの削除はしていない。

### Task 5 テキスト形式

以下をstrict UTF-8で再読し、BOMなし、U+FFFDなし、代表日本語と改行を確認した。日本語のない生成物は文字列・hunk比較でも検証した。元LF/CRLFは保持し、新規ソースはCRLFに統一した。

| パス | エンコーディング / BOM / 改行 | 再読結果 |
| --- | --- | --- |
| docs/superpowers/plans/2026-10-16-monthly-mock-exam-ranking-implementation.md | UTF-8保持 / なし / CRLF保持 | 承認補足の日本語正常 |
| prisma/schema.prisma | UTF-8保持 / なし / CRLF保持 | 正常 |
| prisma/generated/browser.ts | UTF-8保持 / なし / LF保持 | 英文正常 |
| prisma/generated/client.ts | UTF-8保持 / なし / LF保持 | 英文正常 |
| prisma/generated/internal/class.ts | UTF-8保持 / なし / LF保持 | 生成メタデータ正常 |
| prisma/generated/internal/prismaNamespace.ts | UTF-8保持 / なし / LF保持 | 英文正常 |
| prisma/generated/internal/prismaNamespaceBrowser.ts | UTF-8保持 / なし / LF保持 | 英文正常 |
| prisma/generated/models.ts | UTF-8保持 / なし / LF保持 | 英文正常 |
| prisma/generated/models/MockAttempt.ts | UTF-8保持 / なし / CRLF保持 | 英文正常 |
| prisma/generated/models/MockAttemptStartRequest.ts | UTF-8新規 / なし / CRLF | 英文正常 |
| scripts/apply-test-mock-start-requests.mjs | UTF-8新規 / なし / CRLF | 英文正常 |
| scripts/lib/mock-migration.mjs | UTF-8保持 / なし / CRLF保持 | 日本語コメント正常 |
| supabase/migrations/20261017000000_mock_attempt_start_requests.sql | UTF-8新規 / なし / CRLF | 「既存の開始ID」正常 |
| tests/helpers/mock-db.mjs | UTF-8保持 / なし / CRLF保持 | fixture日本語正常 |
| tests/mock-start-schema.integration.test.mjs | UTF-8新規 / なし / CRLF | 英文正常 |
| src/lib/mock-exams/locks.ts | UTF-8保持 / なし / CRLF保持 | 「学生プロフィール」正常 |
| src/lib/mock-exams/start.ts | UTF-8新規 / なし / CRLF | 「新しい受験の開始」正常 |
| tests/mock-start.integration.test.mjs | UTF-8新規 / なし / CRLF | 英文正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8保持 / なし / CRLF保持 | 本文日本語正常 |

Task 6以降の自動保存・API/UI・ランキング・確定/配布/称号/通知/ジョブと最終受入れは未完了。DB検証成功を画面や本番運用の完了とは扱わない。

## Task 6 — 2026-10-17

実装コミット: `7cf62e3`。問題単位の期待revisionで上書きを防ぎ、直近要求ID・内容・元revisionが一致する再送だけを同じ保存結果として返す。実変更時だけ問題/受験全体のrevisionを進め、選択の解除も保存する。累計回答数・正解数は提出時まで増やさない。変更された非nullの選択だけ既存の回答日記録へ連携し、解除・同値・再送・自動採点で回答日やlastSeenAtを作らない。

専用DBテストは初回/最終とも12件成功・失敗0・skip 0。選択→変更→解除、古い再送と同一ID別payloadの拒否、別問題の選択肢/他人の受験拒否、独立2接続の同問CAS競合、保存と提出の競合、実ロック待ちでの期限超過、初期空欄のno-opを確認した。利用日記録の実書込み後に例外を注入して、回答・両revision・追跡開始日・通知がすべてrollbackされることも確認した。

全体suiteは360件中351成功・失敗0・opt-in 9件skip。typecheck/lintはexit 0（既存output警告1件）。対象/staged whitespace検査は正常。新しいDB変更・生成物編集はない。本番変更・pushは未実施。

| パス | エンコーディング / BOM / 改行 | 検証方法・結果 |
| --- | --- | --- |
| src/lib/mock-exams/answers.ts | UTF-8新規 / なし / CRLF | strict再読・U+FFFDなし・「回答の指定が正しくありません」正常 |
| tests/mock-answer.integration.test.mjs | UTF-8新規 / なし / CRLF | strict再読・英文のみ・差分正常 |
| docs/operations/monthly-mock-exam-verification.md | UTF-8保持 / なし / CRLF保持 | strict再読・本文日本語正常 |

Task 7以降のAPI/UI・ランキング・確定/配布/称号/通知/ジョブと最終受入れは未完了。UI実装時は、保存応答の受験全体revisionに予期しない飛びがあれば安全な全体再取得を行い、未確認の別問題変更をそのまま提出承認しない。

## Task 7 — 2026-10-17

学生向け一覧・開始・受験再開・保存・提出・結果APIを追加。要求ごとに有効な学生か確認し、更新系は同一Originと厳密なJSON/UUID/revisionを検証する。全成功/エラー応答をprivate/no-store、Vary: Cookieとし、内部例外は固定500メッセージに置き換える。既知の他人の受験は403、存在しないIDは404。元Prisma行を返さず、許可したDTOだけを組み立てる。

GETによる補完は本人の期限切れ採点だけ。試験・新規受験・ジョブは作らない。複数試験のロック順序逆転を避けるため、期限補完は試験ごとの独立トランザクションとし、一覧はRepeatableReadで読み取る。履歴月は本人の受験が存在する月のみ。ランキングのサービス束縛はTask 10まで準備中503で、ランキングルートはまだない。

HTTP単体7件成功。専用DBの新規読取＋Task 4/6回帰は27件成功・失敗0・skip 0。別学生の連続取得で回答が共有されないこと、停止済み学生の古いactorも拒否すること、一覧が他人の期限切れを採点しないこと、締切1ms前はreview=nullかつ正解/正誤/解説キーなし、締切時刻ちょうどから60問の固定解説が返ることを確認。全体suiteは368件中358成功・失敗0・opt-in 10件skip。型チェック成功。sandbox外ネットワークが必要なDB検証だけ承認済み専用DBへ接続し、本番操作・pushは行っていない。

### Task 7 テキスト形式

以下すべてUTF-8、BOMなし、CRLF（既存は保持、新規は同形式）。strict再読・U+FFFD/BOM/孤立LF検査・代表日本語の目視と差分確認を実施した。

| パス | 新規/保持・日本語確認 |
| --- | --- |
| src/lib/mock-exams/read.ts | 保持・「受験が見つかりません」等正常 |
| src/lib/mock-exams/locks.ts | 保持・「この受験は閲覧・変更できません」正常 |
| src/lib/mock-exams/handlers.ts | 新規・エラー文正常 |
| src/app/api/mock-exams/route.ts | 新規・英文のみ |
| src/app/api/mock-exams/[mockExamId]/start/route.ts | 新規・英文のみ |
| src/app/api/mock-exams/attempts/[attemptId]/route.ts | 新規・英文のみ |
| src/app/api/mock-exams/attempts/[attemptId]/answer/route.ts | 新規・英文のみ |
| src/app/api/mock-exams/attempts/[attemptId]/submit/route.ts | 新規・英文のみ |
| src/app/api/mock-exams/attempts/[attemptId]/result/route.ts | 新規・英文のみ |
| tests/mock-api.test.mjs | 新規・「操作できません」正常 |
| tests/mock-read.integration.test.mjs | 新規・英文のみ |
| tests/mock-submit.integration.test.mjs | 保持・「解説は未登録です」正常 |
| tests/mock-answer.integration.test.mjs | 保持・英文のみ |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文正常 |

Task 8以降は未完了。学生画面・ランキング・最終順位/報酬・称号・通知・Cron運用と本番リリースの完了を意味しない。

## Task 8 — 2026-10-17

模試の提出済み・非null最終回答を本人に限定してPrisma count/groupByで集約し、累計回答数と固定カテゴリ別正解数に加えた。同一問題の2回提出は2回分、受験中・空欄・他人の回答は除外。再提出は同じ集計のまま。固定問題のID/カテゴリだけを参照し、全回答本文を読み出さない。機能停止時は新テーブルを参照せずゼロ集計。既存3引数の称号集計呼出しと互換にした。

提出と同じトランザクションで既存の永久アンロック・通知まで実行する。採点日を回答日として作らず、過去問練習完了・60問満点/0点・日次/ランダム連続は変更していない。単体12件成功、専用DBのTask 4回帰10件成功。通知の実書込み後に故障を注入し、ポイント・累計・採点状態・資格・通知の全rollbackと正常再実行時の通知1件を確認。全体suite 371件中361成功・失敗0・opt-in 10件skip。型チェック成功、本番操作・pushなし。

以下すべてUTF-8/BOMなし/CRLF。既存形式保持、新規も同形式。strict再読・日本語/U+FFFD/BOM/改行・差分を検証した。

| パス | 形式・代表日本語 |
| --- | --- |
| src/lib/titles/facts.ts | 保持・既存日本語コメント正常 |
| src/lib/mock-exams/submit.ts | 保持・「唯一の採点処理」正常 |
| src/lib/mock-exams/title-facts.ts | 新規・「提出済みの最終非空回答」正常 |
| tests/helpers/title-memory.mjs | 保持・英文のみ |
| tests/title-facts.test.mjs | 保持・英文のみ |
| tests/mock-title-learning.test.mjs | 新規・英文のみ |
| tests/mock-submit.integration.test.mjs | 保持・既存日本語fallback正常 |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文正常 |

Task 9以降の学生画面・ランキング等は未完了。

## Task 9 — 2026-10-17

学生向け一覧・受験・結果画面を既存StudentShellで追加。ページは要求ごとの認証と本人確認後に安全なDTOだけを受け取り、RSCへ元Prisma行を渡さない。開始要求IDは応答不明時に維持する。受験は前後/番号移動、変更/解除、自動保存、サーバー期限に基づく残り時間、未回答数、提出確認を実装。保存キューは順に処理し、直近保存の版だけを根拠に後続操作を進める。409・応答不明時は全体を再取得して提出を止め、同じ要求の再試行または明示的な最新状態確認で回復する。

### 検証

| 項目 | 実証結果 |
| --- | --- |
| 単体/render | 保存キュー6件・画面3件成功。HTMLで2試験、残り回数、履歴、未回答、解説未登録fallback、締切前review非混入を確認 |
| 全体suite | 381件中371成功・失敗0・opt-in 10件skip |
| 型/lint | exit 0。既存output警告1件のみ |
| ブラウザー | CUAの文書化済みPlaywright操作を使用。127.0.0.1:3001、デスクトップ1280x720と375x812。Next.jsエラーoverlayなし、回復後タブのerror/warnログなし |
| 開始→保存→競合 | 1回目開始、同一受験の2タブ目から古い版の保存を拒否。最新確認前は提出無効、明示的な読取後に回復 |
| 連続選択 | 初回は画面側busyにより最後のクリックが無視される不具合を再現。修正後、最後の選択のaria-pressed=trueを確認 |
| 解除 | 未回答60問へ戻り、再読込後も空欄維持を確認 |
| offline/復旧 | 今回のNextテストサーバーだけを一時停止。保存失敗・未保存表示・提出無効を確認し、再起動後に同じ受験へ復旧。開発HMRが接続エラー文書へ遷移したため、新しい通常ローカルタブで回復し、警告回避操作はしていない |
| 保存直後の応答喪失 | 一時loopback QA proxyで成功した保存応答だけを失わせ、実キュー＋HTTP＋DBで検証。flush拒否、GETで1回分の変更を確認後、同一ID/payload再送で版が増えず期限不変。proxyのブラウザーhydrationは不安定だったため、この経路はHTTP検証として区別する |
| キーボード/375px | dialog初期focusはキャンセル、Escで閉じると提出確認ボタンへ戻る。375px時scrollWidth=360で横はみ出しなし。ダイアログの両ボタンが枠内 |
| 提出・結果・履歴 | 1回目20pt、2回目空欄0点/0pt、最高点維持、残り1回と履歴への反映。締切前は解説非公開 |
| HTML/RSC | 実認証付きHTTP要求を双方で実行し、締切前にcorrectChoiceId/isCorrect/explanationキーがないことを確認 |

ブラウザーで判明したOrigin判定の内部URL/Host不一致は、既存avatar APIと同様の厳密なHost構文検証を追加して修正した。回帰テストを赤→緑で確認し、異なるOrigin・不正Hostは拒否する。Nodeテスト用loaderも、実Nextのlink/image/navigationの.jsエントリーを解決するよう最小変更した。コンポーネントの偽物には置換していない。

検証専用学生1件・自作模試1件・自作問題60件と関連する回答/通知/ポイント/称号資格だけを、専用DB・UUID・email prefix・createdBy・source prefix照合後に削除した。既存テスト学生や既存問題は触れていない。削除分は実データのバックアップではなく使い捨てfixtureなので、必要時は再生成する。一時proxyも停止済み。スクリーンショットと再現スクリプトはリポジトリー外の可視化ディレクトリーに保持。

### Task 9 テキスト形式

下記はすべてUTF-8/BOMなし/CRLF。既存の形式を保持し、新規も同形式。strict再読・U+FFFD/BOM/改行検査、代表日本語と差分を確認した。

| パス | 新規/保持・日本語 |
| --- | --- |
| src/app/mock-exam/page.tsx | 新規・エラー文正常 |
| src/app/mock-exam/mock-exam-list.tsx | 新規・試験名/説明正常 |
| src/app/mock-exam/attempts/[attemptId]/page.tsx | 新規・エラー文正常 |
| src/app/mock-exam/attempts/[attemptId]/mock-attempt.tsx | 新規・保存/確認文正常 |
| src/app/mock-exam/attempts/[attemptId]/result/page.tsx | 新規・エラー文正常 |
| src/app/mock-exam/attempts/[attemptId]/result/mock-result.tsx | 新規・点数/公開案内正常 |
| src/lib/mock-exams/client-state.ts | 新規・接続エラー案内正常 |
| tests/mock-client-state.test.mjs | 新規・日本語assert正常 |
| tests/mock-student-render.test.mjs | 新規・日本語fixture正常 |
| src/lib/mock-exams/handlers.ts | 保持・Originエラー文正常 |
| tests/mock-api.test.mjs | 保持・日本語エラーfixture正常 |
| tests/helpers/register-title-tests.mjs | 保持・英文のみ |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文正常 |

Task 10以降のランキング・順位確定/配布・ランキング称号・通知・ジョブ・運用と最終受入れは未完了。本番DB変更・pushは未実施。

## Task 10 — 2026-10-17

試験別/月別ランキングAPIと画面を追加。提出済みの最高正解数を採用し、同点の同一学生では1回目を代表にする。順位は1/1/3方式、3位以内の全同点者と本人の順位を表示する。確定前には順位行や順位称号を作らず、確定後は保存済み順位と現在の安全なプロフィールを結合する。停止/退会の学生の導線は無効化し、確定順位を詰めない。任意URLのアイコンは返さない。

取得時の期限切れ補完は1要求最大25件。残件は集計中とし、次の取得で再開する。別学生の受理済み受験にも共通ロック順とロック後の時計を使い、回答を書き換えず期限だけで採点する。利用停止しても既存受験の整合処理を永久に止めない。履歴月は当月以前に限定し、翌月の事前準備を早出ししない。

可視状態だけ15秒間隔、再表示時は即時更新、同時fetchなし、解除時にtimer/listenerを解放する。月/試験切替後に古い応答で上書きしない。ページは要求ごとに再認証し、APIはprivate/no-store。

| 確認 | 結果 |
| --- | --- |
| 単体/render | 4件成功。最高点/初回代表、1/1/3/3、15秒・hidden・復帰・同時fetch防止・解除、応答逆転を確認 |
| 専用DB読取 | 10件成功。未提出除外、他試験/月分離、本人の下位順位、停止学生の順位保持、不正アイコン排除、26件中25件だけ採点、残件継続、保存済み確定順位を確認 |
| 翌月の事前準備 | 履歴に出る状態を赤で確認し、当月以前への制限後に緑 |
| 全体suite | 386件中375成功・失敗0・opt-in 11件skip |
| ブラウザー | CUAで1280x720のFEランキングを確認。1位2人・3位2人の4行と本人欄、翌月タブ非表示、スクリーンショットを確認 |
| 未確認 | 続行時にWork設定でローカルブラウザー操作が無効となったため、Task 10の追加375px実表示・試験切替の実操作は未確認。render/仮想timer/DBテストで代替したがブラウザー成功とは扱わない |

今回の使い捨て4学生・模試1件・自作問題60件と関連行だけをfixtureヘルパーで片付けた。既存学生/問題・本番には触れていない。一時ログインヘルパーは終了。画像証跡は可視化ディレクトリーのmock-task10-ranking-desktop.png。

下記すべてUTF-8/BOMなし/CRLF（既存保持、新規も同形式）。strict再読、U+FFFD/BOM/改行検査と代表日本語・差分を確認。

| パス | 確認 |
| --- | --- |
| src/lib/mock-exams/ranking.ts | 新規・「有効な学生アカウント」等正常 |
| src/lib/mock-exams/ranking-poll.ts | 新規・「古い結果を描画しない」正常 |
| src/lib/mock-exams/handlers.ts | 保持・エラー文正常 |
| src/app/api/rankings/route.ts | 新規・英文のみ |
| src/app/ranking/page.tsx | 新規・エラー文正常 |
| src/app/ranking/ranking-view.tsx | 新規・試験名/順位/案内正常 |
| tests/mock-ranking.test.mjs | 新規・英文のみ |
| tests/mock-ranking-render.test.mjs | 新規・日本語fixture正常 |
| tests/mock-read.integration.test.mjs | 保持・英文のみ |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文正常 |

Task 11以降の順位確定/報酬・ランキング称号・通知・ジョブ・運用と最終受入れは未完了。push・本番適用なし。

## Task 11 — 2026-10-17

25日0時以降に期限切れ受験を最大25件ずつ採点し、残件がなくなった後、試験ロック内の単一トランザクションで最高点の確定順位を保存する。順位スナップショットを再作成せず、配布は別の呼出しから最大25人ずつ再開する。1/2/3位の150/100/75ptは同順位全員に付与し、参加人数や最低点の追加条件は設けない。空の試験も正常に確定する。

1人分の残高・ポイント台帳・称号資格/通知・処理済み印は同一トランザクション。順位行と固有の台帳根拠により並行実行・再試行で重複加算しない。利用停止後も確定順位を詰めず、未配布分だけ継続する。回答日やlastSeenAtを報酬処理から作らない。順位確定と全員への配布完了は別の日時で管理する。

| 確認 | 結果 |
| --- | --- |
| 最終単体＋専用DB | 15件成功・失敗0・skip 0 |
| 境界 | 締切1ms前の確定拒否、締切時刻の採点、0点・1人・0人、1/1/3/4/5と異なる1/2/3位の報酬 |
| 故障注入 | 順位行の実書込み直後の失敗で行/確定印がrollback。通知の実書込み直後の失敗で残高/台帳/資格/通知/処理済み印がすべてrollback |
| 再実行 | 別接続で同じ報酬を並行処理して加算1回。名前変更/利用停止後も元の順位ID・代表受験・点数を保持 |
| 上限 | 26件を25件＋1件で採点/配布し、残件がある間は完了印を付けない |
| 全体suite | 388件中376成功・失敗0・opt-in 12件skip |
| 型/lint | exit 0。既存outputの未使用変数警告1件のみ |

以下すべてUTF-8/BOMなし/CRLF。既存形式を保持し、新規も同形式。strict再読・U+FFFD/BOM/改行・代表日本語と差分を検証した。

| パス | 確認 |
| --- | --- |
| src/lib/mock-exams/settlement.ts | 新規・「確定順位は再作成しない」等正常 |
| src/lib/mock-exams/rewards.ts | 新規・「月次模擬試験の順位報酬」等正常 |
| tests/mock-ranking.test.mjs | 保持・英文のみ |
| tests/mock-settlement.integration.test.mjs | 新規・「変更後の名前」正常 |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文日本語正常 |

Task 12以降のランキング称号・通知・ジョブ・教師画面・運用と最終受入れは未完了。本番変更・pushなし。保存済み計画の補助スクリプトがプラグイン更新で利用できなくなったため、同じ最終テストを直接実行し、結果と進捗を手動記録した。テスト省略や代替成功扱いはしていない。

## Task 12 — 2026-10-17

実装コミット: `0f984b1`。新形式の確定順位だけから試験別に1/2/3位の完全一致回数とtop3の過去最大連続暦月数を集約する。暫定順位・試験の確定印なし・他学生・対象外試験・旧形式の行は対象外。12月→1月は連続、欠月と4位以下は中断。IT/FEの実績は合算しない。7種類だけを有効化し、既存の名称・条件値・価格と「過去問くん」の固定58対象は変更していない。

報酬処理は既存の共通同期処理へ接続済み。ショップ再訪でも確定実績を再評価し、初回遡及済みの学生に新しい資格を反映する。最初の遡及日時は変更せず、資格は永久保存、通知は各称号1回、所有/装備は自動変更しない。模試機能停止中は新テーブルを読まずゼロ実績とし、保存済み資格による無料購入は可能。条件説明に「同じ試験」を明示した。

| 確認 | 結果 |
| --- | --- |
| RED→GREEN | 無効な7定義と未実装collectorで失敗後、単体49件成功。既に遡及済みの実DB学生が新資格0件になる再現後、再訪同期で7件反映 |
| 最終単体＋専用DB | 61件成功・失敗0・skip 0。Task 11の通知失敗rollbackを順位称号でも再検証 |
| 実DB履歴 | FEの1/2/3位各3回、連続9か月、IT別実績、暫定行/確定印なし除外、他学生実績ゼロを確認 |
| 永久資格・購入 | 初回判定済み学生の資格7件/通知各1件、再訪で再通知なし。機能停止後の0pt手動購入、二重購入拒否、残高/台帳/装備/元の遡及日時不変 |
| 全体suite | 400件中387成功・失敗0・opt-in 13件skip |
| 型/lint | exit 0。既存outputの警告1件のみ |

下記すべてUTF-8/BOMなし/CRLF。既存は保持、新規も同形式。strict再読、U+FFFD/BOM/改行と代表日本語・差分を確認した。

| パス | 確認 |
| --- | --- |
| src/lib/mock-exams/ranking-title-facts.ts | 新規・「過去最大の暦月連続」正常 |
| src/lib/titles/contract.ts | 保持・英文のみ |
| src/lib/titles/facts.ts | 保持・既存日本語正常 |
| src/lib/titles/rules.ts | 保持・既存日本語正常 |
| src/lib/titles/catalog.ts | 保持・称号名正常 |
| src/lib/titles/unlocks.ts | 保持・「ショップ再訪時」正常 |
| src/lib/titles/shop.ts | 保持・「同じ試験」正常 |
| tests/mock-ranking-titles.test.mjs | 新規・停止中の資格コメント正常 |
| tests/fixtures/title-facts.mjs | 保持・英文のみ |
| tests/helpers/title-memory.mjs | 保持・英文のみ |
| tests/title-catalog.test.mjs | 保持・初期称号名正常 |
| tests/title-rules.test.mjs | 保持・英文のみ |
| tests/title-purchase.test.mjs | 保持・称号名正常 |
| tests/title-shop-contract.test.mjs | 保持・「同じ試験」assert正常 |
| tests/mock-settlement.integration.test.mjs | 保持・名前変更fixture正常 |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文日本語正常 |

使い捨て履歴fixtureは専用DBの自作学生/試験/受験/順位と関連行のみ削除済み。既存学生/問題や本番には触れていない。元の保護対象の未ステージ差分も保持。Task 13以降の通知・教師画面・ジョブ/運用・最終受入れは未完了。pushなし。

## Task 13 — 2026-10-17

毎月20日9時以上・25日0時未満に、両試験とも未提出の有効な学生へ月1通のベル通知を保存する処理を追加。進行中は対象、どちらか一方でも提出済みなら対象外。予定時刻より後に登録した学生は対象外（ちょうどは含む）。最大100人のUUIDカーソル方式で再開し、送信直前にも学生ロック内で時刻・役割・状態・登録日・提出を再確認する。recipient/type/month一意制約とskipDuplicatesで再試行・並行実行を重複させない。

通知DTOにnullableな対象月を追加し、通知からその月の模試一覧へ移動する契約を追加した。不正な月は遷移先なし。既存の個別既読・ベル・一覧を再利用し、返信アイコン・全既読や新しい画面は追加していない。掲示板/称号通知の導線は維持する。

| 確認 | 結果 |
| --- | --- |
| RED→GREEN | 新種別が称号文言へ落ち、読取時に未対応で失敗することを確認後、契約4件成功 |
| 最終単体＋専用DB | 13件成功・失敗0・skip 0 |
| 日時/対象 | 20日9時1ms前は0、ちょうどは未開始/進行中へ1通、両試験それぞれの提出で除外、遅い登録・教師・停止・退会除外、25日ちょうど0 |
| 再確認/再送 | 候補取得後の利用停止/提出を除外。ロック後の時計が締切に達した場合も0。不正月/cursor、機能停止を拒否 |
| 故障/分割 | 実書込み直後の例外で通知rollback、独立2接続の並行再試行で1通。101人を100人＋1人で処理 |
| 個別既読 | 他学生のrecipient条件では更新0件、本人条件で更新1件。既存一覧renderでも通知文・未読表示、返信アイコン/全既読なし |
| 全体suite | 404件中390成功・失敗0・opt-in 14件skip |
| 型/lint | exit 0。既存output警告1件のみ |
| 実画面の未確認 | CUA接続を再確認したがWork設定でローカルブラウザー操作が無効。通知クリック→既読→対象月遷移の実操作は未検証。契約/実DB/renderの成功と区別する |

テストの候補取得は全本来条件に自作学生UUIDをANDし、既存学生へ通知しない。各fixtureの自作ユーザー/試験/受験/通知と関連行だけを片付け、既存学生/問題は保持した。本番変更・pushなし。Cronからの自動呼出しはTask 15/16まで未接続。

下記はすべてUTF-8/BOMなし。既存のLF/CRLFをそれぞれ保持し、新規はCRLF。strict再読・U+FFFD/BOM/改行検査、代表日本語と差分を確認した。

| パス | 改行・確認 |
| --- | --- |
| src/lib/mock-exams/reminders.ts | 新規CRLF・「候補選択後の提出・利用停止」正常 |
| src/lib/notifications/contract.ts | CRLF保持・通知文正常 |
| src/lib/notifications/read.ts | LF保持・英文のみ |
| src/lib/notifications/write.ts | LF保持・英文のみ |
| tests/mock-reminders.integration.test.mjs | 新規CRLF・英文のみ |
| tests/notifications-contract.test.mjs | CRLF保持・通知文assert正常 |
| tests/notification-read-rules.test.mjs | LF保持・既存日本語と模試通知文正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/progress.md | UTF-8/BOMなし/CRLF保持・strict再読と日本語の検証記録正常（未追跡の進捗台帳） |
| docs/operations/monthly-mock-exam-verification.md | CRLF保持・本文正常 |

Task 14〜17の教師画面・署名付きジョブ・Cron/運用・最終受入れが残る。実装済みの通知処理を、実運用の配信開始とは扱わない。

## Task 14 — 2026-10-19

実装コミット: `1f0ce2d`。教師向けの試験/月別状況ページとAPIを追加。未開始・受験中・提出済みの人数は100人ページの外も集計し、提出済みを優先する。学生行には2回分の提出点・最高点・順位だけを返し、問題・回答・解説・メール等は含めない。対象学生は現在利用可能かつその月の締切前の登録者と明示した。確定後の順位は保存値を使い、教師の読取から採点・報酬・試験/受験を作らない。

既存教師guardと固定の管理者表示を維持し、サイドバーへ既存方式のSVG付き導線を追加。手動出題・点数変更・回数追加・教師の称号/マイページは設けていない。サービスでもDB上の最新役割/状態を確認し、APIはprivate/no-storeと固定エラーメッセージ。不正月・試験・重複cursor配列等は400にする。

| 確認 | 実証結果 |
| --- | --- |
| RED→GREEN | サービス/画面/導線不存在を確認後に実装。重複cursor配列がPrismaエラーになる再現後、400へ修正 |
| 専用DB | 教師以外とDBで停止された教師の拒否、101人の100+1ページでも同じ全体件数、3状態、2回分/最高点、試験/月分離、確定順位保存値、採点/報酬副作用なし |
| 全体suite | 408件中393成功・失敗0・opt-in 15件skip |
| 型/lint | exit 0。既存output警告1件のみ |
| 実HTTP | API: 教師200・学生403・匿名401、ページ: 教師200・学生307でホーム・匿名307で教師ログイン。教師から学生APIは403 |
| PC | 1280x800の実画面で管理者名、導線、3状態、FEの50.00/75.00/最高75.00・1位を確認。IT切替でFE結果が消える |
| 戻る操作 | 初回はURL/結果がFEでもselectだけITに復元される不具合を観測。フォームの履歴値自動復元を抑止し、同じFE→IT→Backでselect=fe・月2026-10・最高75.00の一致を確認 |
| 375px | 375x812で表示。document.scrollWidth=360、フォーム左右16〜344px、サイドバーは画面外に閉じ、横はみ出しなし |
| UI健康 | 教師表示で空白画面/エラーoverlayなし、コンソールerror/warnなし。通知の初回に既知のPrisma内部pg非推奨警告が1件出たが、最終の通知タブは空 |

### Task 13の未確認項目の解消

ブラウザー操作が再び利用可能になったため、専用DBの使い捨て通知でクリック→当月模試一覧を実操作した。DBのreadAtと未読0件を実HTTPでも確認。Nextルート履歴だけの更新では、別文書への移動後に古い初期未読表示が戻る経路が残ることも再現した。そのため既読更新後のルート更新に加え、一覧マウントとpageshowで現在のprivate通知一覧を再取得する。再実行した通常Backと別ページ経由Backの両方で未読0件を確認済み。通知1件を自作fixture内で未読へ戻して反復し、本番/既存学生は変更していない。

証跡は可視化フォルダーの `mock-task14-desktop.png`、`mock-task14-mobile.png`、`mock-task13-read.png`。実操作用タブを閉じ、viewportを解除し、一時loopbackヘルパーも終了。4件の自作アカウント・模試1件・自作過去問60件と関連する回答/ポイント/通知/称号だけを識別照合後に削除した（使い捨てfixtureは再生成可能）。既存テスト学生/過去問は保持。

### テキスト形式

すべてUTF-8/BOMなし。strict UTF-8で再読し、代表日本語、U+FFFDなし、元の改行と差分を確認した。既存LF/CRLFは個別に保持、新規ソースはCRLF。

| パス | 形式・日本語確認 |
| --- | --- |
| src/lib/teacher/mock-exams.ts | 新規CRLF・教師専用エラー/コメント正常 |
| src/app/api/teacher/mock-exams/route.ts | 新規CRLF・英文のみ |
| src/app/teacher/mock-exams/page.tsx | 新規CRLF・取得エラー文正常 |
| src/app/teacher/mock-exams/mock-exam-status.tsx | 新規CRLF・状態/説明/欄名正常 |
| src/components/role-shell.tsx | CRLF保持・管理者/導線正常 |
| tests/teacher-mock-exams.test.mjs | 新規CRLF・学生名/状態assert正常 |
| tests/teacher-shell.test.mjs | LF保持・既存日本語正常 |
| src/app/notifications/notification-list.tsx | LF保持・再取得エラー/コメント正常 |
| docs/operations/monthly-mock-exam-verification.md | CRLF保持・本文正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/progress.md | CRLF保持・strict再読/日本語正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/task-14-brief.md | 補助スクリプト新規UTF-8/BOMなし/LF・日本語正常 |
| 可視化フォルダー/mock-task14-browser-qa.mjs | 新規UTF-8/BOMなし/LF・英文のみ |
| 可視化フォルダー/mock-task14-http-qa.mjs | 新規UTF-8/BOMなし/LF・英文のみ |

本番変更・pushなし。Task 15〜17の署名付きジョブ、非公開Cron呼出し/運用、全体受入れが残る。

## Task 15 — 2026-10-19

実装コミット: `cc4872a`。短期HMAC認証とnonceの一度きり消費、120秒の実行権・交代後の進捗上書き拒否、1/5/15/60分の再試行を追加した。1回の呼出しで業務1バッチを扱い、期限切れ採点→出題準備→通知→確定/配布の順に進める。HTTP成功と業務完了は別で、残件を明示する。25秒の予算は学生間の区切りで判定し、実行中の原子的な学生処理は中断しないため、1件と進捗保存分だけ超過し得る（DBトランザクション上限30秒）。

| 確認 | 実証結果 |
| --- | --- |
| RED→GREEN | 署名処理の不存在、通常envからテスト子プロセスへのmock設定混入、通知予算で3人処理してしまう問題を再現後に実装 |
| 最終対象テスト | 単体＋専用DB45件成功・失敗0・skip 0。採点/通知回帰も含む拡大実行65件成功 |
| 認証 | 時刻±60秒境界、method/path/query/body/project/environment/key改ざん、通常ログインのみを拒否。署名後の再送と並行nonce消費は一度だけ受理 |
| 再開 | 独立2接続の並行取得、期限ちょうどのlease交代、旧workerのcursor/完了上書き拒否。業務commit後に停止しても再開時の参加ポイントは1件 |
| 遅延/予算 | 20日通知、25日確定と翌月準備、未来月の再抽選なし、並行tickの重複配布なし。学生間で停止し未処理分をcursorへ引継ぎ |
| 保持 | 3分超nonceの整理、30日超エラー詳細だけ消去。業務keyとcompletedAtを保持 |
| 全体suite | 415件中397成功・失敗0・opt-in 18件skip |
| 型/lint | exit 0。既存outputのunused警告1件のみ。専用DB実行時に既知のpg非推奨警告あり |

テスト起動は継承した全KAKOMON_MOCK_設定を消し、専用ファイルで検証した許可済み値だけを渡す。通常envの本番署名秘密をテストへ持ち込まない。既存の起動済み子プロセスには後から設定変更が反映されないため、再起動時は専用ファイルに必要なmock設定を明示する。秘密値・既存envファイルは変更していない。

下記はUTF-8/BOMなし/CRLF。strict再読、U+FFFDなし、代表日本語と差分を確認した。新規ファイルは機械的な改行整形後に再確認し、既存ファイルは元形式を保持した。

| パス | 確認 |
| --- | --- |
| src/lib/mock-exams/job-auth.ts | 新規・認証/設定エラー文正常 |
| src/lib/mock-exams/jobs.ts | 新規・再試行/期限切れコメント正常 |
| src/app/api/internal/mock-exams/tick/route.ts | 新規・英文のみ |
| src/lib/mock-exams/ranking.ts | 保持・期限切れ整合コメント正常 |
| src/lib/mock-exams/settlement.ts | 保持・確定/配布エラー正常 |
| src/lib/mock-exams/reminders.ts | 保持・送信直前再確認コメント正常 |
| scripts/test-environment.mjs | 保持・英文のみ |
| tests/mock-job-auth.test.mjs | 新規・英文のみ |
| tests/mock-jobs.integration.test.mjs | 新規・英文のみ |
| tests/test-environment.test.mjs | 保持・英文のみ |
| docs/operations/monthly-mock-exam-verification.md | 保持・本文正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/progress.md | 保持・検証記録正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/task-15-brief.md | 補助スクリプト新規UTF-8/BOMなし/LF・日本語正常 |

使い捨ての自作ユーザー/試験/問題/業務jobと関連行だけを片付け、既存データと保護対象の変更は保持。本番変更、Vault登録、Cron開始、pushなし。Task 16のSQL/運用とTask 17の全体受入れは未完了。

## Task 16 — 準備中（2026-10-19）

非公開scheduler SQL・運用書・実DBテストを作成したが、テストDBへの拡張/関数追加は別承認待ち。読取確認ではテストDBにpgcrypto/Vaultあり、pg_cron/pg_netとmock_exam_privateは未作成。anon/authenticatedのVault schema/平文viewアクセスはともになし。DB変更・秘密登録・HTTP送信・Cron登録はまだ行っていない。

公式pg_net実装のbody::textが空白付きJSONを送るため、Task15のcompact本文限定では正しいHMACも401になることを実テストで再現した。2種類の完全固定本文だけを認め、生バイトのhash/署名はそのまま検証する最小修正後、互換性/改ざん/61秒遅延テストが成功。任意本文の解析や署名oracleは追加していない。

最新suiteは417件中398成功・失敗0・opt-in 19件skip。新しいSQLの実DB検証はそのskipに含まれ、未検証を成功扱いしない。単体成功だけではSQLの構文/インストール済み権限/キューとの一致を保証できない。Task16完了と最終受入れは未宣言。

下記はUTF-8/BOMなし/CRLF。strict再読、U+FFFD/BOM/改行と差分、日本語の代表行を確認。新規を機械的にCRLFへ整形し、既存形式は保持した。

| パス | 確認 |
| --- | --- |
| supabase/migrations/20261016010000_mock_exam_scheduler.sql | 新規・英文のみ、未適用 |
| tests/mock-cron-sql.test.mjs | 新規・英文のみ、DB部分未実行 |
| docs/operations/monthly-mock-exams.md | 新規・接続先/停止/保持rollbackの日本語正常 |
| src/lib/mock-exams/job-auth.ts | CRLF保持・既存エラー日本語正常 |
| docs/operations/monthly-mock-exam-verification.md | CRLF保持・本文正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/progress.md | CRLF保持・判定記録正常 |
| .superpowers/sdd/2026-10-16-monthly-mock-exam-ranking-implementation/task-16-brief.md | 補助スクリプト新規UTF-8/BOMなし/LF・日本語正常 |
