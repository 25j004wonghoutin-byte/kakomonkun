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
