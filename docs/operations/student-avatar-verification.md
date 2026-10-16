# 学生アイコン実装の検証記録

確認日: 2026-10-16（日本時間）。対象設計: `docs/superpowers/specs/2026-10-15-student-avatar-design.md`。実装計画: `docs/superpowers/plans/2026-10-15-student-avatar-implementation.md`。

状態: 実装・全体検証済み、独立レビュー待ち。本番設定・push・deployは未実施。

## 確認環境

- 指定フォルダーの `codex/title-conditions` ブランチ。DB・Storageは専用Supabase `grzylombpqmidltnbwhx`。本番プロジェクトは操作していない。
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

- 通常の全体テストは311件中308件成功、失敗0、実接続の明示実行用3件をskip。アイコンの実接続テストは別途6件すべて成功。
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
- 専用テスト環境での確認であり、Vercel本番の環境変数・Storage設定・既存データ・利用量は別途確認する。
- 本番には本番プロジェクトのサーバー専用キー、同じ非公開bucket設定、対象限定RLSが必要。SQLを適用する前に接続先を確認し、DBと画像本体を別々にバックアップする。手順は `student-avatars.md` を参照。
- DBテーブル／カラムの追加はない。アプリのpush・本番設定・deployはユーザーの確認後に行う。

## 最終レビュー

独立レビューの結果を追記する。現在はレビュー前。

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
| tests/avatar-storage.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| tests/helpers/avatar-live.mjs | UTF-8 | なし | CRLF | 保持 |
| tests/helpers/avatar-memory.mjs | UTF-8 | なし | CRLF | 保持 |
| tests/test-environment.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
