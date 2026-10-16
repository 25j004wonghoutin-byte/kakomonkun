# 学生アイコンの運用と復旧

対象: 2026-10-15承認の学生アイコン設計。実装・テスト環境と本番環境の反映状況は `student-avatar-verification.md` を確認する。

## 環境ごとの設定

- 専用テスト: Supabase `grzylombpqmidltnbwhx`、`.env.test.local` のDB・公開キーと `TEST_SUPABASE_SECRET_KEY` または `TEST_SUPABASE_SERVICE_ROLE_KEY`。テストサーバーは通常の `.env.local` に追加されたキーを使わない。
- 本番: 本番プロジェクトの `NEXT_PUBLIC_SUPABASE_URL` とサーバー専用 `SUPABASE_SECRET_KEY`、未指定時だけ同プロジェクトの `SUPABASE_SERVICE_ROLE_KEY`。テストキーをVercel本番へ入れない。公開キーでは保存しない。
- 各プロジェクトに `student-avatars` を個別作成する。非公開、ファイル上限2097152 bytes、許可MIME `image/webp`。実行時の自動作成・公開化は行わない。
- 専用RLSは匿名・通常JWTのStorage直接SELECT/INSERT/UPDATE/DELETEをこのバケットだけで拒否する。既存のPERMISSIVE policyが広くても拒否されることを実リクエストで確認する。サービスキーはRLSを迂回するため、閲覧・変更権限の判定はアプリAPIにも必要。
- 既存の非null avatar_urlは導入前に形式を検査する。管理外URLは表示を初期状態へ退避し、本人に再アップロードしてもらう。一括書換えや外部画像の取得・削除はしない。

## 接続先と閲覧確認

テストは `node --import ./tests/helpers/register-title-tests.mjs scripts/check-avatar-storage.mjs --test`、アプリは `node scripts/start-test-server.mjs` で127.0.0.1:3001へ起動する。
DBとStorageのホストが同じ専用プロジェクトであることを検査し、秘密キー・DBパスワードを画面やログへ出さない。
画像URLは `/api/avatars/<users.id>/<UUID>`、実オブジェクトは `<users.id>/<UUID>.webp`。AuthのユーザーIDを代入しない。
ログイン済みの学生・教師で現在の画像が取得でき、未ログイン・ログアウト後・無効ユーザーでGET/HEADとも401になることを確認する。旧versionは404。
画像とエラーのCache-Controlは `private, no-store, max-age=0`、VaryはCookie、正常画像にnosniff。公開・署名付きURLや画像最適化URLを配信しない。

## エラーと再確認

400は入力不正、401は認証、403はrole/Origin、409は別操作との競合、413は容量、415は形式。503は設定/Storage障害、保存結果不明等で利用する。
結果不明時は現在のプロフィールを読み直す。旧参照を強制的に戻したり、新しいキーを即時削除したりしない。
保存成功後の旧画像削除失敗は保存自体を失敗にせず、`Avatar maintenance` にイベント種別と管理キーだけを記録する。内部例外や資格情報は記録しない。

Storage側のキャッシュにより、削除API成功・metadata削除後も直後のdownloadが旧データを返す場合がある。削除確認はStorage一覧・metadataと区別し、アプリの画像APIは必ずDBの現在参照を先に照合する。Storageのキャッシュ応答だけを理由に、旧参照を復活させたり追加削除したりしない。

## 未参照ファイルの後片付け

定期清掃は実装しない。候補の一覧は読取専用で、作成24時間以上・正規キー・所有者確認済み・現在未参照だけを対象にする。一覧の時点では削除しない。

```powershell
node --import ./tests/helpers/register-title-tests.mjs scripts/avatar-maintenance.mjs --env-file C:/Users/WONGHOUTIN/Documents/kakomonkun/.env.test.local --project-ref grzylombpqmidltnbwhx --list
```

削除するファイルはユーザーに確認し、環境と対象の完全な単一キーを指定する。下記のOWNER_UUID/VERSION_UUIDは確認した値に置き換える。本番では明示した本番専用envファイルと本番project refを用い、一覧・バックアップを先に確認する。

```powershell
node --import ./tests/helpers/register-title-tests.mjs scripts/avatar-maintenance.mjs --env-file C:/Users/WONGHOUTIN/Documents/kakomonkun/.env.test.local --project-ref grzylombpqmidltnbwhx --delete-key OWNER_UUID/VERSION_UUID.webp --confirm-project grzylombpqmidltnbwhx
```

削除直前に作成日時を再取得し、User→StudentProfileの短い行ロックで進行中更新の確定を待って現在参照と再照合する。ロック解放後に単一キーだけを削除する。既存キーの再採用APIはないため、この間に別の通常操作がそのキーを現在値に戻すことはない。
ロック・照合・所有者確認が失敗する場合や結果不明の場合はdeferredとして残す。prefix全消去・ワイルドカード・他バケットへの削除は提供しない。

## バックアップと復旧

1. 本番反映や手動清掃前に、通常のDBバックアップを取得する。
2. 現在参照される管理キーの一覧と `student_profiles.user_id / avatar_url` の対応を、秘密情報を保護したリポジトリ外のバックアップ先へ保存する。
3. 同じキーのStorage画像本体も別途ダウンロードし、件数・ファイルサイズ・対応を照合する。SupabaseのDBバックアップにはStorage画像本体は含まれない。
4. 復旧時はバックアップと同じ環境か確認し、非公開バケットへ画像本体を戻した後、対応するDB参照を整合させる。通常の更新APIでは旧キーを再採用しないため、復旧は承認された保守操作として扱う。
5. 学生・教師・未ログインの各条件で再度閲覧権限を確認する。旧画像を物理削除済みの場合、DBの値だけを戻しても復元できない。

アプリのrollbackで新画像APIがなくなった場合は、画像が読めない箇所を初期表示に退避する。復旧のためにバケットを公開化しない。元画像や画像履歴は保存しない。

一次資料: [Supabase Backups](https://supabase.com/docs/guides/platform/backups)、[Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)。
