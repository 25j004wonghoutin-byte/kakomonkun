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
