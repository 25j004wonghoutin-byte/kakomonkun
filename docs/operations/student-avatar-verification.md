# 学生アイコン実装の検証記録

確認日: 2026-10-16（日本時間）。対象設計: `docs/superpowers/specs/2026-10-15-student-avatar-design.md`。実装計画: `docs/superpowers/plans/2026-10-15-student-avatar-implementation.md`。

状態: 実装・全体検証・独立レビューと指摘修正済み。本番Storage設定は2026-10-16に承認を受けて適用・確認済み。Vercelの本番キー設定は同日ユーザーから設定済みの連絡あり（こちらで値を独立照合したとは扱わない）。push・deployは未実施。

## 確認環境

- 初期実装は指定フォルダーの `codex/title-conditions` ブランチ。DB・Storageは専用Supabase `grzylombpqmidltnbwhx`。初期検証では本番を操作していない。その後mainへ統合し、本番Storageだけを下記の承認範囲で設定した。
- 開発サーバー: http://127.0.0.1:3001 。本番形式の一時確認サーバーは127.0.0.1:3002で実行し終了済み。
- Browserプラグインがないため、既存のPlaywrightとインストール済みChromeで検証。PC1366×1000、スマートフォン390×844のタッチ対応エミュレーション。
- テスト用Authアカウントとアプリ内の学生A/B・教師を一時作成し、検証後にそのユーザー・画像・一時RLSポリシーだけを削除。通常のtest-student等のアカウントは削除していない。
- 非公開の `student-avatars` バケット（WebPのみ・2097152 bytes上限）と `student_avatars_server_only` 制限ポリシーはテストプロジェクトに保持する。

## 実DB・Storage・認証で確認したこと

`KAKOMON_RUN_AVATAR_QA=1` を明示したintegrationテストは6件成功。flagなしの通常実行では実接続テストを明示skipする。専用キー不足を成功扱いにしない。

- 実Supabaseセッションで画像を保存し、学生B・教師も現在の画像を取得できる。透明部分を含む512×512 WebPを実際にデコードして確認した。
- 未ログイン・無効ユーザーは401、教師の変更は403。他人のowner指定は400、期待値の偽装や古い画像への変更は409。
- 画像の差替え後の旧URLと、削除後のURLは404。DBの現在参照に画像本体が欠ける場合も404。
- 画像・エラーのno-storeとVary、HEAD・条件付き/Rangeリクエストの認証を確認した。
- 一時的に広いPERMISSIVEポリシーを追加しても、新バケットの匿名・通常JWTによる直接取得／一覧／アップロード／署名URL作成／削除は許可されない。サービス経由の画像が保持されることも確認した。一時ポリシーは検証後に削除。
- 独立したPrisma接続の同時保存、保存対削除で勝者が一つになり、その画像を失わない。後片付け用の所有者行ロックが進行中commitを待ち、commit後に現在参照と再照合することを確認した。
- 保存・削除によって名前・ポイント等の既存profileフィールドが変わらないことを確認した。

## ブラウザーで確認したこと

PC・スマートフォンとも、ページ同一性、正常な本文表示、フレームワークエラーなし、横はみ出しなし、予期しないコンソールエラーなし。意図的な画像404と保存タイムアウトの障害テストでは、想定したネットワークエラーだけを記録した。

- PNG・JPEG・WebP、透明画像、縦横比の違い、EXIF方向、1px画像、5MiBちょうどを読込。空・破損・GIF・SVG・HEIC・5MiB超過は説明付きで拒否。
- ドラッグ・実タッチイベント・矢印キー・Shift付き移動・拡大率1〜3倍を操作。プレビューのpixelと保存後WebPのpixelを比較し、同じ切り抜きであることを確認。
- 調整・キャンセルでは送信しない。保存の二重クリックは1回だけ送信。削除は確認を挟み、初期表示へ戻る。
- Tabがdialog内に留まり、編集時Escapeで閉じて元のボタンへフォーカスが戻る。保存処理中はEscapeで閉じない。
- 別操作が先に保存した場合の409、最新参照への同期、自動再送なしを確認。
- 実際に30秒の保存タイムアウトを発生させ、最新状態を読み直して回復できることを確認。
- 名前が既知の掲示板ヘッダーは画像情報を1回だけ取得。マイページは渡された画像を利用して重複取得しない。遅れた旧me応答が新画像を上書きしない。
- 管理外のlegacy URLは画像として取得しないが、生の期待値を保持した再アップロードは成功する。
- 画像404後に初期表示へ戻り、無限再試行せず、新しいバージョンでは再表示する。React接続前に失敗した画像も回復する。

検証スクリプト・画像はリポジトリ外の `C:/Users/WONGHOUTIN/.codex/visualizations/2026/09/02/01a05fb1-e11a-7cd1-abc1-b8a35b794bd7/` に保存。
画像: `student-avatar-editor-1366.png`、`student-avatar-editor-390.png`、`student-avatar-profile-1366.png`、`student-avatar-profile-390.png`。

## ビルド・既存変更の保護

- 通常の全体テストは315件中312件成功、失敗0、実接続の明示実行用3件をskip。アイコンの実接続テストは別途6件すべて成功。
- `npm run build` 成功。環境変数は検証した専用テスト設定を明示し、NODE_ENV=productionで実行。開発サーバーと出力先を分離した。
- 本番形式で学生・教師の実Supabaseセッションが利用でき、開発用Cookieだけでは認証できない。学生の開発ログインは404。教師の旧devパスは既存の実ログインAPIへの別名であり、資格情報なしは401、開発用ログインCookieを発行しない。
- `npm run typecheck` 成功。`npm run lint` はエラー0、既存の `output/ipa-answer-audit-2026-10-14/db-correction.mjs:162` の未使用変数警告1件。
- 既存のpgドライバー非推奨警告（同じclientでの並列query）はサーバーログに残る。今回の画像処理で新しい並列queryを同一トランザクションへ追加していない。
- 問題データ・Prisma生成物・称号ショップの未コミット変更など24ファイルのSHA256が作業前と一致。Prisma生成物はビルド前にバイト単位でバックアップし、生成後も同一だった。

## 実装時の判断

1. sharpの追加は `--ignore-scripts` で実行。既存のネイティブ本体が利用でき、Prismaの既存生成物を保護できるため。誤っていればnative import/buildが失敗するが、実画像処理とビルドを確認済み。
2. サーバー配線を `avatars/server.ts` に分離してStorage設定を遅延解決。認証前に設定不足で落ちないため。誤っていれば未認証応答が変わるためAPIテストで確認。
3. 編集の非同期処理を `avatar-editor-state.ts` に分離。React自体の複雑なmockを作らず、本番と同じ処理で再選択・二重送信・同期回復を検証するため。追加の内部契約を維持する負担がある。
4. 認証付き画像は通常のimgで直接取得。共有画像最適化を経由しない設計に合わせた。自動画像最適化は利用しないが、保存画像は512px・2MiB以下に制限済み。
5. Origin照合にはURLのprotocolと妥当性を確認した実Hostを使用。Nextの内部localhost URLとの差を解消するため。任意のx-forwarded-hostは採用しない。誤っていれば特定proxy構成で拒否される可能性があるため、ローカルと本番形式の実応答・不正Hostを検証済み。

## 残る確認範囲と本番導入

- Safari/iOS実機・Firefoxでは未検証。今回のスマートフォン確認はChromeのエミュレーション。WebP出力やImageBitmap非対応時は説明を表示する。
- Vercel本番のキーはユーザー確認済みだが、こちらでの値の独立照合・公開後のアプリ全経路・利用量は未確認。Storage単体の本番確認は下記の範囲で完了している。
- 本番Storageには本番プロジェクトのサーバー専用キー、非公開bucket設定、対象限定RLSを利用する。今後画像を保存・清掃する際はDBと画像本体を別々にバックアップする。手順は `student-avatars.md` を参照。今回の追加設定では既存画像・画像参照は0件で、既存データを変更していない。フルDBの新規バックアップ・復元試験を実施したとは扱わない。
- アプリ用DBテーブル／カラムの追加はない。本番Storage設定だけ承認済みで、アプリのpush・deployは未実施。

## 本番Storage設定（2026-10-16承認・実施）

- 対象: `ckgoikdjhtklhbzdgxxs`。MCPの接続先とローカル本番設定のproject一致を確認し、本番キーでStorage読取が成功してから実行した。キーの新規発行・変更・表示はしていない。Vercel Productionの本番キーもユーザーより設定済みの連絡あり。秘密値はチャットへ受け取らず、独立照合はしていない。
- 実行前: bucket 0件、Storage policy 0件、非null画像参照0件。Storage APIで `student-avatars` を新規作成し、private・2097152 bytes・MIME `image/webp` のみを確認。
- `student_avatars_server_only` をRESTRICTIVE / ALL / anon・authenticatedで適用。条件はUSING・WITH CHECKとも `bucket_id <> 'student-avatars'`。適用前にbucket設定一致と同名policy不存在を検査し、既存設定の上書きはしなかった。Supabase migration履歴: `20261016042304_student_avatars_server_only`。policy本体は `supabase/avatar-storage-policy.sql` と同じ。
- 検証用の512px WebPでサーバー経由保存・取得のSHA256一致を確認。匿名の直接取得・署名URL発行・アップロードは拒否、一覧には画像が出ず、削除要求でも画像が保持された。public URLも拒否。Prismaでanon・authenticated roleに切り替えた読取は各0行。
- 検証用画像だけをStorage APIで削除し、最終的にStorage一覧・storage.objectsとも0件を確認。アプリ内ユーザー・プロフィールは追加／更新／削除していない。他bucket・他Storage policyも0件のまま。
- 削除直後のStorage downloadがキャッシュ済み画像を返す場合を実測。削除API成功・metadata削除と区別して扱う。アプリはStorage取得前にDBの現在参照を照合するため、旧versionや削除済み参照を配信しない設計で、専用テスト環境のAPI検証済み。本番アプリ経由の確認はdeploy後に残す。
- Security Advisorには今回のStorageに関する指摘なし。既存31件のRLS有効・policyなしINFOは今回変更していない（ブラウザー直接DB利用向けの許可policyを追加していない）。既存の漏えいパスワード保護無効WARNも対象外のため変更なし。[RLS INFOの説明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[Auth警告の説明](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。
- 称号ショップのソート・フィルターは `457e27b` でmainへ追加。コミットだけを別フォルダーへ展開し、2104ファイルのGit blob一致を確認して、全体312成功・0失敗・3明示skip、lint警告0、build・typecheck成功。依存は既存ロック済みパッケージの独立コピーを利用し、新規インストールや本番DB接続は行わなかった。

## 最終レビュー

独立したレビュー担当は関連ローカルテスト82件成功を確認し、ユーザー向け動作・認証・データ安全性に阻害要因なしと判定した。指摘は事前チェックCLIの終了コード1件。実装担当は、設定不足を成功扱いして導入判断を誤る影響からImportantに分類し、1回の修正パスで対応した。

- `tests/avatar-storage-preflight.test.mjs` は外部DB・Storage・設定読取だけを代替し、実際のCLIを子プロセスで実行する。正常・bucket欠落・policy欠落・両方欠落の4条件で診断JSONと終了コードを検証。
- 修正前は設定欠落3条件が0終了して失敗（RED）。修正後は正常だけ0、欠落は1で4件成功（GREEN）。全体テストも312成功・失敗0。正常な実テスト環境でread-onlyチェックを再実行し、bucket/policy有効・0終了を確認。
- 未対応のMinor指摘はない。独立レビュー後にアプリ本体は変更せず、CLI・回帰テストと記録だけを更新した。

レビュー担当が独立判定を保留した4項目についての実装担当の判断:

6. 実DB・Storage・Auth・ブラウザー操作はレビュー担当の再実行対象外だが、主担当による実接続6件・実Chrome操作・検証コードを根拠に今回のテスト範囲では受入。誤っていればmockでは見えない実サービス障害が残る。
7. Safari/iOS実機・Firefox互換性は未検証のまま明示し、確認済みとは扱わない。誤っていれば対象ブラウザーで画像選択・WebP出力の差が残る。
8. 独立レビュー時点では本番設定・deploy・バックアップ復元を未実施として別承認の作業に残した。その後、本番Storageだけは上記の承認を受けて設定したが、テスト成功を本番アプリ検証や復元成功に読み替えない。誤って省略すれば本番の設定不足や復旧不能を見落とす。
9. 称号ショップ・問題データ・生成物の既存dirty変更はアイコン機能レビュー／コミットから除外。24ファイルの保護ハッシュを再確認。誤っていれば無関係の変更を取り込む危険がある。

## 変更テキストの文字コード確認

検証方法: 各ファイルを厳格なUTF-8デコーダーで再読込し、BOM・CRLF/単独LF・置換文字を調べ、日本語の代表行を確認した。既存の混在改行は維持。下表のパスはリポジトリルートに対する相対パス。

| パス | 文字コード | BOM | 改行 | 日本語再読込 |
| --- | --- | --- | --- | --- |
| docs/operations/student-avatar-verification.md | UTF-8 | なし | CRLF | 保持 |
| docs/operations/student-avatars.md | UTF-8 | なし | CRLF | 保持 |
| docs/superpowers/plans/2026-10-15-student-avatar-implementation.md | UTF-8 | なし | CRLF | 保持 |
| docs/superpowers/specs/2026-10-15-student-avatar-design.md | UTF-8 | なし | CRLF | 保持 |
| package-lock.json | UTF-8 | なし | CRLF | 日本語なし |
| package.json | UTF-8 | なし | CRLF | 日本語なし |
| scripts/avatar-maintenance.mjs | UTF-8 | なし | CRLF | 日本語なし |
| scripts/check-avatar-storage.mjs | UTF-8 | なし | CRLF | 日本語なし |
| scripts/test-environment.mjs | UTF-8 | なし | CRLF | 保持 |
| src/app/api/avatars/[userId]/[version]/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/app/api/me/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/app/api/profile/avatar/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/app/board/board-feed.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/board/page.tsx | UTF-8 | なし | CRLF | 日本語なし |
| src/app/board/post-card.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/board/posts/[postId]/page.tsx | UTF-8 | なし | CRLF | 日本語なし |
| src/app/board/posts/[postId]/post-detail.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/board/reply-dialog.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/board/users/[userId]/public-profile.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/profile/avatar-editor-state.ts | UTF-8 | なし | CRLF | 保持 |
| src/app/profile/avatar-editor.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/profile/avatar-image.tsx | UTF-8 | なし | CRLF | 保持 |
| src/app/profile/profile-dashboard.tsx | UTF-8 | なし | CRLF | 保持 |
| src/components/student-avatar.tsx | UTF-8 | なし | CRLF | 保持 |
| src/components/student-shell.tsx | UTF-8 | なし | CRLF＋既存単独LF 10行 | 保持 |
| src/lib/avatars/cleanup.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/lib/avatars/contract.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/crop.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/lib/avatars/handlers.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/image.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/repository.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/request.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/server.ts | UTF-8 | なし | CRLF | 日本語なし |
| src/lib/avatars/service.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/storage-config.ts | UTF-8 | なし | CRLF | 保持 |
| src/lib/avatars/storage.ts | UTF-8 | なし | CRLF | 保持 |
| supabase/avatar-storage-policy.sql | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-api.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-cleanup.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-crop.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-database.integration.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-display.test.mjs | UTF-8 | なし | CRLF | 保持 |
| tests/avatar-editor.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-image.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-request.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-service.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-storage-preflight.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/avatar-storage.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/helpers/avatar-live.mjs | UTF-8 | なし | CRLF | 保持 |
| tests/helpers/avatar-memory.mjs | UTF-8 | なし | CRLF | 保持 |
| tests/test-environment.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
