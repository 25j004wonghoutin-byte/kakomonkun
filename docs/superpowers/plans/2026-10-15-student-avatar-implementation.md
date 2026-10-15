# Student Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学生本人がアイコンを切り抜いて保存・削除し、有効な学生・教師だけが現在の画像を閲覧できるようにする。

**Architecture:** ブラウザーで切り抜いた画像をアプリAPIで再検証し、非公開Supabase Storageへ保存する。既存の `student_profiles.avatar_url` をPrismaで条件付き更新し、認証付き画像APIから配信する。StorageとDBの処理結果を分けて扱い、競合・結果不明でも現在の画像を誤削除しない。

**Tech Stack:** Next.js 16.2.9 / React 19.2.4 / TypeScript / Prisma 7.8 / Supabase Storage / Canvas・Pointer Events・ネイティブdialog / sharp 0.34.5（直接依存の追加は承認後）。

**Spec:** `docs/superpowers/specs/2026-10-15-student-avatar-design.md`（2026-10-15承認済み）。実装者は本計画と設計書の両方を読む。

## Global Constraints

- 「変更・削除できるのは、ログインした有効な学生本人だけ。」教師は固定表示を維持する。
- 「有効な学生・教師は、他の学生の現在の画像を閲覧できる。未ログインでは、画像URLを知っていても新規取得できない。」
- 元画像はJPEG・PNG・WebP、`5 * 1024 * 1024` bytes以下。保存は512×512px、1フレームのWebP、最大2MiB、品質85、透明部分を維持してメタデータを除く。
- 切り抜きは1:1、丸いプレビュー、最小カバー倍率を基準に1〜3倍。移動・倍率調整だけを提供する。
- multipart全体は `2 * 1024 * 1024 + 64 * 1024` bytes以下。元画像は端末外へ送らない。
- バケットは非公開の `student-avatars`、キーは `<appUserId>/<version>.webp`、DB参照は `/api/avatars/<appUserId>/<version>`。versionはサーバー生成UUID。再利用・上書きしない。
- 「新規テーブル・カラムは追加しない。」DBアクセスはPrisma経由。認証は `getCurrentUser()` を使う。
- 「Storageの公開URL・閲覧用署名付きURLはブラウザーへ渡さない。」画像APIは `Cache-Control: private, no-store, max-age=0`、`Vary: Cookie`。画像は `X-Content-Type-Options: nosniff` も付ける。
- 保存・削除の期待値は編集開始時のDBの生の `avatarUrl`。表示用の安全化で期待値を消さない。結果不明の新画像は即時削除しない。
- 専用テストプロジェクトは `grzylombpqmidltnbwhx`。本番キー・接続先へのフォールバックは禁止。実Storage未検証を成功と報告しない。
- 既存の称号ショップ、問題データ、Prisma生成物の未コミット変更を保存し、この作業のコミットに混ぜない。AI解説は対象外。
- 既存ファイルの文字コード・BOM・改行を監査して維持する。新規テキストはUTF-8／BOMなし／CRLF。`student-shell.tsx` の既存混在改行も一括変換しない。
- 実装前にインストール済みNextのRoute Handlers、Imageの `unoptimized`、Client Componentsのガイドを読む。静的化・共有キャッシュ・画像最適化を画像APIに導入しない。

## Review Focus

1. 管理外の古い画像URL：表示は初期アイコンに戻すが、期待値は保持し再アップロードできること。Task 3・6。
2. 保存応答が途切れ、遅れてDBが確定：新画像を削除せず、UIの再取得が失敗しても古い値で上書きしないこと。Task 3・5・8。
3. 画像Aのデコード中に画像Bを選択：Aの遅延完了がBを上書きせず、破棄したバッファも解放すること。Task 5。
4. 既存の広いStorageポリシー：非公開バケットという設定だけで判断せず、通常JWT・匿名の直接操作を拒否できること。Task 8。
5. 名前がサーバーから渡されたヘッダー：画像も表示され、保存直後に古い `/api/me` 応答で巻き戻らないこと。Task 6。

---

## 作業境界・実行方法

この計画の作成時点ではアプリ・DB・Storageは変更していない。現在の `codex/title-conditions` ブランチ、指定フォルダー内で進める。実装開始時に差分とハッシュを保存し、既存変更を保護する。

推奨は、同じタスク内で主担当がTask 1〜8を順に実装し、最後に独立レビューを行う方法。各Taskで失敗するテスト→最小実装→成功確認→対象ファイルだけのローカルコミットとする。本計画の承認でpushや本番設定まで実行しない。

実装開始の確認には、`sharp@0.34.5` を直接依存に固定して追加することと、Task 8で専用テストプロジェクトの `student-avatars` バケット・対象限定ポリシーを設定することを含める。秘密キーの値は会話・Gitに書かず、テスト用設定ファイルからだけ読む。これらへの承認がまだなければ、その操作の前で確認する。

テスト用資格情報が不足していてもTask 1〜7のローカル実装・疑似障害テストは進められる。Task 8の実接続検証は不足を明示して保留する。本番反映は結果を提示した後に別途扱う。

## ファイル構成と責務

| 範囲 | ファイル | 責務 |
| --- | --- | --- |
| 契約・Storage | 新規 `src/lib/avatars/{contract,storage-config,storage}.ts` | URL・サイズ・エラー契約、環境検証、固定バケットのサーバー操作 |
| 画像入力 | 新規 `src/lib/avatars/{image,request}.ts` | 実デコード・再エンコード、制限付き本文読取 |
| データ整合性 | 新規 `src/lib/avatars/{repository,service}.ts` | Prismaの条件付き更新、Storageとの処理順・補償 |
| HTTP | 新規 `src/lib/avatars/handlers.ts`、新規 `src/app/api/profile/avatar/route.ts`、新規 `src/app/api/avatars/[userId]/[version]/route.ts` | 認証・同一オリジン検査・エラー応答・画像配信 |
| 編集UI | 新規 `src/lib/avatars/crop.ts`、新規 `src/app/profile/{avatar-image,avatar-editor}.tsx` | 切り抜き計算、画像の凍結・出力、編集dialog |
| 表示 | 新規 `src/components/student-avatar.tsx`、既存マイページ・シェル・掲示板 | 共通の認証付き表示と読込失敗時の初期表示 |
| 環境 | 既存 `scripts/test-environment.mjs`、新規 `scripts/check-avatar-storage.mjs` | テスト資格情報の明示的引渡し・接続前検査 |
| 保守 | 新規 `src/lib/avatars/cleanup.ts`、新規 `scripts/avatar-maintenance.mjs`、新規 `docs/operations/student-avatars.md` | 未参照候補一覧・確認済み単一キーの後片付け・復旧 |
| 環境設定 | 新規 `supabase/avatar-storage-policy.sql` | 新バケットだけに適用するStorage RLS。アプリDBのSchema変更ではない |
| 検証 | 各Taskの `tests/avatar-*.test.mjs` と専用のintegrationファイル | 入力・競合・権限・表示・実接続を分けて確認 |

パスはリポジトリルートからの相対表記。既存の `src/lib/profile-data.ts` は生の期待値を含む契約を維持し、不要な変更をしない。既存テストローダーを再利用し、テストのために新しいライブラリやnpm scriptは追加しない。

### Task 1: 画像参照・非公開Storage・テスト環境の契約

**Files:** Create `src/lib/avatars/contract.ts`, `storage-config.ts`, `storage.ts`; modify `scripts/test-environment.mjs`; test `tests/avatar-storage.test.mjs`, `tests/test-environment.test.mjs`.

**Interfaces:**
- `AvatarRef = { userId: string; version: string; key: string; url: string }`。`parseAvatarUrl(value: unknown): AvatarRef | null`、`createAvatarRef(userId: string, version: string): AvatarRef`。
- `AvatarError` は `code: string`、`status: number`、安全な `message` を持つ。内部例外はレスポンスに含めない。
- `AvatarStorage` は `put(key: string, bytes: Uint8Array): Promise<void>`、`get(key: string): Promise<Uint8Array | null>`、`remove(key: string): Promise<void>`、`list(): AsyncIterable<{key: string; createdAt: Date}>`。固定バケット内の正規キーのみ扱う。
- `getAvatarStorageConfig(env: Record<string, string | undefined>): {url: string; secret: string}`、`createAvatarStorage(config): AvatarStorage`。実装はserver側からだけimportする。
- 既存 `validateTestConfig` / `buildTestProcessEnv` の引数・必須項目は維持し、`.env.test.local` に明記された `TEST_SUPABASE_SECRET_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` だけを追加で扱う。

- [ ] **Step 1: 契約と隔離の失敗テストを書く。** `parse_rejects_external_or_encoded_path` は外部URL、クエリ、fragment、`..`、エンコードされた区切り、非UUIDをnullにする。正規参照は往復一致する。
  ```js
  assert.equal(parseAvatarUrl('https://example.com/a.webp'), null);
  assert.deepEqual(parseAvatarUrl(ref.url), ref);
  assert.equal(buildTestProcessEnv(valid(), { SUPABASE_SECRET_KEY: 'production' }).SUPABASE_SECRET_KEY, '');
  ```
  `secret_precedence_and_missing_config` でサーバーsecret優先・未指定時だけlegacy fallback・公開キー拒否・エラーへの値非露出を確認する。`storage_never_upserts_or_signs` はputの `upsert:false` と秘密URL非返却、listの複数ページ処理を確認する。
- [ ] **Step 2: 失敗を確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-storage.test.mjs tests/test-environment.test.mjs`。新しい契約の未実装による失敗を確認し、既存隔離テストの失敗と区別する。
- [ ] **Step 3: 契約とStorageアダプターを実装する。** Supabaseクライアントはセッション永続化・自動更新を無効化し、fetchをno-storeにする。Storage通信には有限のタイムアウトを設定し、成功が不明なputを「確実に未保存」と分類しない。キーは環境設定からだけ取得し、リクエストから受け取らない。
- [ ] **Step 4: テスト専用secretを安全に引き渡す。** 通常のサーバー変数名と `TEST_SUPABASE_*` は親processから全て消してから、専用ファイルの値だけをマッピングする。legacy JWTはrole=`service_role`とproject refを確認する。opaque secretはprefixだけで所属確認できたとは扱わず、Task 8の対象ホストへの読取検証を実接続の必須条件にする。キーなしでも従来のテストサーバーは動作し、画像操作だけが設定不足になる。
- [ ] **Step 5: Step 2のテストを成功させ、Task 1の6ファイルだけをstageして `feat: add private avatar storage contract` でコミットする。** 秘密値を含むenvはstageしない。

### Task 2: 画像の実検証と本文サイズ制限

**Files:** Create `src/lib/avatars/image.ts`, `request.ts`, `tests/avatar-image.test.mjs`, `tests/avatar-request.test.mjs`; modify `package.json`, `package-lock.json`（依存追加承認後）。

**Interfaces:**
- `normalizeAvatarImage(bytes: Uint8Array): Promise<Uint8Array>`：検証・再エンコード済みのWebPだけを返す。
- `readAvatarUpload(request: Request): Promise<{image: Uint8Array; expectedAvatarUrl: string | null}>`。
- `readAvatarDelete(request: Request): Promise<{expectedAvatarUrl: string | null}>`。これらは認証後に呼ばれる。
- Task 1の `AvatarError` を使い、空・破損・不正寸法・多フレームは400、容量は413、実形式がWebP以外なら415。

- [ ] **Step 1: 境界の失敗テストを書く。** `actual_decode_and_metadata_strip` はfixture生成後に出力を独立してデコードし、`width===512`、`height===512`、`pages===1`、`format==='webp'`、`exif===undefined`、alpha維持をassertする。透明画像・破損WebP・512以外・アニメーションWebP・偽装PNGも検査する。
  ```js
  assert.ok(output.byteLength <= 2 * 1024 * 1024);
  assert.equal(responseForOversizedStream.status, 413);
  assert.equal(responseForDuplicateImageFields.status, 400);
  ```
  `stream_limit_without_content_length` はContent-Lengthなし／偽装で上限+1 byteを検出し読み取りを中止する。境界ちょうどの本文・画像はサイズ理由で拒否しない。image/expectedの重複、不足、追加のowner項目、不正JSON、複数ファイルも400とする。
- [ ] **Step 2: 対象テストを実行し失敗を確認する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-image.test.mjs tests/avatar-request.test.mjs`。
- [ ] **Step 3: 承認済みの場合だけ `npm install --save-exact sharp@0.34.5` を実行する。** lock差分を確認し、無関係な更新を混ぜない。sharpはAPIのNode runtimeからだけ使う。
- [ ] **Step 4: 制限付きパーサーと画像検証を実装する。** 本文streamを実測して上限内のバッファに収め、その後だけ標準formDataで解析する。DELETEは64KiB上限。expectedは生のstringまたはnull、独立した任意URLの取得に使わない。Sharpで入力画素数を512×512に制限し、metadataと実デコードの両方を通す。ページ数・寸法を確認し品質85で再エンコード、出力サイズを再確認する。
- [ ] **Step 5: Step 2を成功させ、Task 2の6ファイルだけをstageして `feat: validate and normalize avatar uploads` でコミットする。** fixtureに個人の写真を入れず、テスト内生成画像を使う。

### Task 3: Prisma更新・競合・結果不明の処理

**Files:** Create `src/lib/avatars/repository.ts`, `service.ts`, `tests/avatar-service.test.mjs`, `tests/helpers/avatar-memory.mjs`.

**Interfaces:**
- `AvatarRepository`：`current(userId: string): Promise<{avatarUrl: string | null; activeStudent: boolean} | null>`、`replace(userId: string, expected: string | null, next: string | null): Promise<'updated' | 'conflict' | 'denied'>`、`unreferencedAfterLock(ref: AvatarRef): Promise<boolean>`。
- `createAvatarRepository(prismaClient: PrismaClient): AvatarRepository`。PrismaClientは既存生成クライアントの型。DB通信例外は伝播し、確定した競合・拒否と通信結果不明を混同しない。
- `createAvatarService({repository, storage, newVersion, log})` は `save({userId, expectedAvatarUrl, image}): Promise<{avatarUrl: string}>`、`remove({userId, expectedAvatarUrl}): Promise<{avatarUrl: null}>`、`read(ref: AvatarRef): Promise<Uint8Array | null>` を返す。imageはTask 2で正規化済み。`newVersion(): string` は本番でcrypto.randomUUID、`log(event: string, ref: AvatarRef): void` は秘密を含まない後片付け記録。
- テストの `createAvatarMemory()` は同じRepository/Storageポート、保存キー集合、呼出し記録、任意段階を停止・失敗させる制御を返す。実Prismaのロック保証はTask 8で別に検証する。

- [ ] **Step 1: 順序と失敗のテストを書く。** `upload_before_compare_swap_before_old_delete`、`loser_only_cleans_own_new_key`、`delete_commits_null_first`、`already_null_delete_is_idempotent` でStorage/DBの記録順と最終参照をassertする。生のlegacy URLを期待値にした保存も成功し、legacy外部URLの削除は0回とする。
  ```js
  assert.equal(winnerRef, currentAvatarUrl);
  assert.equal(storedKeys.has(winnerKey), true);
  assert.equal(deleteCalls.includes(winnerKey), false);
  ```
  `unknown_commit_retains_new_object` はcommit応答を失わせ、直後の旧値読取→遅れて新値確定を再現して新キー削除0回を確認する。`old_cleanup_failure_keeps_success` は200相当の成功と後片付け記録を確認する。画像変更で名前・bio・称号・ポイント・通知の更新は0回とする。
- [ ] **Step 2: `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-service.test.mjs` を実行し、未実装の失敗を確認する。**
- [ ] **Step 3: Repositoryを実装する。** 短いPrismaトランザクション内でUser→StudentProfileの順に行をロックし、学生role・active・未削除を再確認する。同じロック順をreplaceとunreferencedAfterLockで使う。現在値を比較してから参照だけ更新する。Storage通信はトランザクション外。既存の名前変更・称号イベント処理は呼ばない。
- [ ] **Step 4: Serviceを実装する。** 新しいキーへput→replace→確定後の旧キー後片付け。確定した競合・拒否なら今回のキーだけ、所有者と現在未参照を再照合して削除する。照合できなければ削除を保留する。DB/Storage通信の結果不明は削除せず安全な5xxにする。旧キー削除失敗は保存成功を取り消さない。削除も同じreplaceを使い、新しい別画像には409。readは有効な対象学生の現在参照と一致するときだけ固定キーを読む。
- [ ] **Step 5: Step 2を成功させ、Task 3の4ファイルだけをstageして `feat: serialize avatar updates and safe cleanup` でコミットする。**

### Task 4: 認証付きアップロード・削除・画像配信API

**Files:** Create `src/lib/avatars/handlers.ts`, `src/app/api/profile/avatar/route.ts`, `src/app/api/avatars/[userId]/[version]/route.ts`, `tests/avatar-api.test.mjs`.

**Interfaces:**
- `createAvatarHandlers({getUser, service, normalizeImage})` は `post(request): Promise<Response>`、`remove(request): Promise<Response>`、`image(request, params: {userId: string; version: string}): Promise<Response>` を返す。
- `getUser()` は既存 `getCurrentUser()` の有効ユーザーまたはnull。normalizeImageはTask 2、serviceはTask 3。APIのownerはgetUserのidだけから決める。
- routesはNode runtime。POST/DELETEをhandlersへ委譲し、GET/HEADは共通image handlerへ `await context.params` を渡す。

- [ ] **Step 1: 権限表を実行するテストを書く。** `anonymous_or_inactive_never_reads_body_or_storage` は401かつ本文/Storage読取0回。`teacher_can_view_not_mutate` はGET/HEAD200、POST/DELETE403。student BのリクエストにAのownerを追加したら400、期待値だけAにしたらB自身への409となりAの参照は不変。別roleは403。
  ```js
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(teacherMutation.status, 403);
  assert.equal(oldVersion.status, 404);
  ```
  `range_and_conditional_do_not_bypass_auth` はCookieなしのHEAD・Range・If-None-Matchも401、304/206にしない。認証済みのRange/conditionalは無視して通常200（HEADは本文なし）。`reject_cross_origin_before_parsing` はOrigin欠落・不一致を403。URL/キー/DB詳細をエラー本文に含めない。
- [ ] **Step 2: `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-api.test.mjs` で失敗を確認する。**
- [ ] **Step 3: handlerとrouteを実装する。** 認証→role→変更時Origin検査→制限付き入力→画像検証→Serviceの順。Originは `new URL(request.url).origin` と厳密比較し、任意の転送ヘッダーを信用しない。画像の全応答へno-store/Vary、正常画像へnosniff。HEADも存在と権限を確認してから本文を省く。管理URLへredirectしない。
- [ ] **Step 4: Step 2を成功させ、Task 4の4ファイルだけをstageして `feat: expose authenticated avatar endpoints` でコミットする。** 設定不足のAPIを安全な5xxにし、アプリ全体のモジュール初期化を落とさない。

### Task 5: 手動切り抜きと画像編集dialog

**Files:** Create `src/lib/avatars/crop.ts`, `src/app/profile/avatar-image.tsx`, `avatar-editor.tsx`, `tests/avatar-crop.test.mjs`, `tests/avatar-editor.test.mjs`.

**Interfaces:**
- `CropState = {zoom: number; x: number; y: number}`。x/yは中心からの移動量を切り抜き枠一辺=1で正規化。`clampAvatarCrop(width, height, state): CropState`、`avatarSourceRect(width, height, state): {sx, sy, sw, sh}` は元画像pixel座標を返す。
- `prepareAvatarSource(file: File): Promise<{width: number; height: number; source: CanvasImageSource; dispose(): void}>` と `encodeAvatarCrop(prepared, state): Promise<Blob>` をavatar-imageで実装する。同じ向き補正済み静止画をpreview/outputで共有する。
- `AvatarEditor({open, currentAvatarUrl, onClose, onSaved}: {open: boolean; currentAvatarUrl: string | null; onClose(): void; onSaved(avatarUrl: string | null): void})`。currentAvatarUrlは表示用ではなくDB生値。保存開始時にスナップショットを取りTask 4へ送る。

- [ ] **Step 1: 切り抜きの計算テストを書く。** 幅1000×高さ500の中心・zoom1なら `{sx:250,sy:0,sw:500,sh:500}`、zoom2なら `{sx:375,sy:125,sw:250,sh:250}`。縦長、1px画像、枠サイズ変更、端への過剰ドラッグでも元画像外へ出ないことをassertする。
- [ ] **Step 2: 編集状態・送信の失敗テストを書く。** `cancel_never_uploads`、`double_save_sends_once`、`late_decode_cannot_replace_new_selection`、`unknown_save_refetch_failure_does_not_rollback` を用意する。mock fetchで件数・送信Blobのtype/寸法・JSON.stringifyしたexpectedを確認する。保存結果不明なら `/api/me` をno-storeで読み直し、再取得にも失敗したら成功扱いも旧値再送もしない。再取得で同期できるまでは重複する変更を許さず、閉じる操作は回復させる。
- [ ] **Step 3: `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-crop.test.mjs tests/avatar-editor.test.mjs` で失敗を確認する。** Canvas・ネイティブdialog・pointerの実挙動は疑似DOMで済ませずTask 8のブラウザー項目へつなぐ。
- [ ] **Step 4: 切り抜き処理とdialogを実装する。** sourceのサイズ・magic bytes・形式を端末内で確認し、EXIFを適用した静止画へ一度だけデコードする。Pointer Eventsでpan、label付きrangeでzoom、矢印キーで枠の1%移動（Shiftで5%）。出力は512px、品質0.85のWebP、type/サイズを再確認する。非対応ブラウザーには説明を出す。画像選択と解放には世代番号を使い、古い非同期処理の完了を無効化する。
- [ ] **Step 5: 保存・削除・回復UIを実装する。** 編集中Escape/キャンセルで破棄、処理中は多重送信と閉じる操作を禁止。fetchは30秒で打ち切り、結果不明として再取得する。409では最新値へ同期し「別の操作でアイコンが更新されました。確認して再度操作してください。」と表示して自動再送しない。削除は明示確認を挟む。Object URL/Bitmap/Canvasを再選択・終了時に解放する。dialog内のスクロールと固定操作欄、エラー通知、終了時フォーカス復帰を入れる。
- [ ] **Step 6: Step 3を成功させ、Task 5の5ファイルだけをstageして `feat: add accessible avatar crop editor` でコミットする。**

### Task 6: マイページ・ヘッダー・掲示板への統一反映

**Files:** Create `src/components/student-avatar.tsx`, `tests/avatar-display.test.mjs`; modify `src/app/profile/profile-dashboard.tsx`, `src/components/student-shell.tsx`, `src/app/api/me/route.ts`, `src/app/board/{page.tsx,board-feed.tsx,post-card.tsx,reply-dialog.tsx}`, `src/app/board/posts/[postId]/{page.tsx,post-detail.tsx}`, `src/app/board/users/[userId]/public-profile.tsx`.

**Interfaces:**
- `StudentAvatar({avatarUrl, displayName, size, className, fallback}: {avatarUrl: string | null; displayName: string; size: number; className?: string; fallback?: ReactNode})`。StudentAvatarは教師の分岐では使わず、既存の教師表示を保持する。
- StudentShellに `avatarUrl?: string | null` を追加。undefinedは未取得、nullは取得済み未設定。MyPageはprofileの生値を渡す。他画面は既存の `/api/me` 取得で名前と画像を一度に解決する。
- `/api/me` は既存profileの数値フィールドを保ち、`profile.avatarUrl: string | null` を追加。本人の期待値復旧にも使うため生値を返すが描画は必ず正規参照だけにする。
- BoardFeedのviewer、PostDetail/ReplyDialogのpropsへ `avatarUrl: string | null` を追加する。pageで解決済みの学生プロフィールから渡し、投稿・返信入力欄ごとのfetchを増やさない。

- [ ] **Step 1: 表示と同期の失敗テストを書く。** `legacy_url_never_becomes_image_src` は管理外URLへのネットワーク要求0、fallback表示、editorには生のexpectedを渡すことを確認する。`new_version_recovers_from_image_error` は失敗URLの再試行を止め、新versionでは再表示できることを確認する。
  ```js
  assert.equal(imageRequestUrls.includes('https://legacy.example/avatar.png'), false);
  assert.equal(meFetchCountForNamedShell, 1);
  assert.equal(headerAvatarAfterSave, savedAvatarUrl);
  ```
  `controlled_avatar_ignores_stale_me_response` は保存後に古いme応答を完了させ、headerが新画像のままであることを確認する。制御されたavatarと名前が揃うMyPageではme取得0回。教師固定表示、既存氏名・ポイント・称号の保持も確認する。
- [ ] **Step 2: `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-display.test.mjs tests/profile-title-display.test.mjs tests/board-page-render.test.mjs tests/teacher-shell.test.mjs` で新規テストの失敗を確認する。**
- [ ] **Step 3: 共通画像表示とヘッダーを実装する。** parseAvatarUrlを通し、`next/image` の `unoptimized` でsame-origin直接取得、丸形・固定サイズ・object-fitを指定する。URLごとに読込失敗を管理し、既存初期表示をfallbackへ渡す。名前propがある場合も画像未取得ならmeを解決し、propで確定した画像を古いfetchで上書きしない。polling・グローバルな永続キャッシュは追加しない。
- [ ] **Step 4: MyPageと掲示板を接続する。** MyPageの画像付近に「アイコンを変更」を置き、成功コールバックでprofile.avatarUrlだけを更新する。名前/bio/称号編集dialogは独立のまま。掲示板の既存リンク・サイズ・教師表示を保って背景画像を共通表示へ置換し、入力欄にも現在画像を渡す。他人の表示は次回取得時に反映する。
- [ ] **Step 5: Step 2を成功させ、Task 6で列挙したファイルだけをstageして `feat: show student avatars across profile and board` でコミットする。** 既存全体の文字コードやstudent-shellの混在改行を変換しない。

### Task 7: 未参照画像の確認・後片付け・復旧手順

**Files:** Create `src/lib/avatars/cleanup.ts`, `scripts/avatar-maintenance.mjs`, `tests/avatar-cleanup.test.mjs`, `docs/operations/student-avatars.md`.

**Interfaces:**
- `listAvatarCleanupCandidates({storage, repository, now}): Promise<Array<{ref: AvatarRef; createdAt: Date}>>`。読取専用で、管理形式・24時間以上・所有者確認・未参照の候補だけを出す。候補一覧は削除許可を意味しない。
- `cleanupAvatarObject({ref, storage, repository, now}): Promise<'deleted' | 'deferred' | 'current'>`。直前に作成日時をStorageから再確認し、Task 3のunreferencedAfterLockで照合してから単一キーを削除する。
- CLIは `node --import ./tests/helpers/register-title-tests.mjs scripts/avatar-maintenance.mjs` に続けて `--env-file <absolute-path> --project-ref <ref> --list` を指定する読取専用モードが基本。削除は同じenv/project指定に `--delete-key <exact-key> --confirm-project <same-ref>`、1回1キーのみ。デフォルトenv・親processへのfallback、ワイルドカード、prefix全削除を提供しない。

- [ ] **Step 1: 誤削除防止の失敗テストを書く。** `less_than_24_hours_is_deferred`、`current_or_unknown_owner_is_never_deleted`、`pending_commit_blocks_cleanup`、`delete_failure_retains_candidate` を用意し、23:59:59は削除0、24:00:00かつ未参照確定だけ削除1とassertする。行ロック取得失敗・照合失敗・管理外キーは削除0。複数ページにまたがる一覧と対象外バケット非接触も確認する。
- [ ] **Step 2: `node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-cleanup.test.mjs` で失敗を確認する。**
- [ ] **Step 3: cleanupとCLIを実装する。** configのDB・Storageを明示projectへ照合し、秘密値をログに出さない。unknownな処理は候補のまま残す。実削除はユーザーが対象を確認した後だけ実行し、このTaskで既存画像の清掃はしない。
- [ ] **Step 4: 運用資料を書く。** テスト/本番で異なるキー、接続先チェック、bucket/private/2MiB/WebP、RLS検査、no-store、エラー分類を記載する。DBと画像ファイル+キー対応を別々にバックアップし、復旧は非公開bucketへ画像を戻した後にDB参照を整合させる。古いアプリへのrollback時はAPI不在による初期表示退避を明記する。公開化や全削除を復旧手順にしない。
- [ ] **Step 5: Step 2を成功させ、Task 7の4ファイルだけをstageして `feat: add guarded avatar maintenance workflow` でコミットする。** 定期ジョブと新規管理テーブルは作らない。

### Task 8: 専用DB・Storageでの実検証と本番導入準備

**Files:** Create `scripts/check-avatar-storage.mjs`, `supabase/avatar-storage-policy.sql`, `tests/avatar-database.integration.test.mjs`, `docs/operations/student-avatar-verification.md`; update `docs/operations/student-avatars.md` with実測結果に基づく手順。ブラウザーテストとスクリーンショットは許可されたリポジトリ外のvisualizationsディレクトリへ保存する。

**Interfaces:**
- `node --import ./tests/helpers/register-title-tests.mjs scripts/check-avatar-storage.mjs --test`：Task 1のテストconfigだけを使用し、対象ホストへのread-only認証・bucket設定・管理外既存参照の件数を確認する。値/キーは出力しない。missing/wrong configは非0終了。
- `KAKOMON_RUN_AVATAR_QA=1` でだけ実DB/Storage integrationを起動する。flagありでsecret不足ならskipではなく失敗。通常の全テストでは明示skip。既存ユーザーを上書きせず、run ID付きの専用学生A/Bとteacher fixtureを作り、そのID・キーだけ後片付けする。

- [ ] **Step 1: 接続先・既存設定を読取確認する。** grzylombpqmidltnbwhx以外での実行を拒否する。DBとStorageの両方、既存bucket/policy、student_profilesの非null参照形式を確認する。Supabaseの公式Storageアクセス制御資料で現在のポリシー構文を照合する。
- [ ] **Step 2: テストStorage設定を適用する。** 事前承認がある場合だけprivate bucketを作成し、2MiB/WebPを設定する。SQLはstorage.objectsに対しanon/authenticatedの直接SELECT/INSERT/UPDATE/DELETEを新bucketに限って拒否するRESTRICTIVE policyとし、既存の広いPERMISSIVE policyがあっても保護する。他bucketへの判定はtrue、service roleのAPI利用は維持する。既存同名bucketがpublic等で矛盾する場合は無断転用せず停止する。適用先・差分を記録し、本番には適用しない。
- [ ] **Step 3: 実連携テストを作り、対象限定で実行する。** 実Storageへ保存→学生B/教師からAPI閲覧→差替え→旧URL404→削除→初期表示を検証する。独立した2つのPrisma接続を使って同時保存/保存対削除/cleanup対commitを実行し、勝者の参照とファイルの保持をassertする。疑似サービスだけの競合テストを実DB確認と数えない。
  ```powershell
  $env:KAKOMON_RUN_AVATAR_QA = '1'
  node --import ./tests/helpers/register-title-tests.mjs --test tests/avatar-database.integration.test.mjs
  Remove-Item Env:KAKOMON_RUN_AVATAR_QA
  ```
  フラグは実行後にfinally相当で除去する。対象fixtureの明示ID以外は削除せず、残った対象は報告する。
- [ ] **Step 4: ブラウザーで編集と表示を検証する。** Browserプラグインが利用できれば優先し、なければ理由を記録して既存Playwrightを使う。`node scripts/start-test-server.mjs` の127.0.0.1:3001で、PC1366×1000と390×844のタッチ画面を確認する。縦/横/小画像/透明/EXIF方向、5MiB境界、PNG/JPEG/WebP、GIF/SVG/HEIC拒否、pan/zoom/矢印/Tab/Escape、再選択、30秒timeout、409、削除確認、二重送信、操作欄表示・フォーカスを実操作で確認する。プレビューと保存後画像の切り抜きを比べ、コンソールエラー・横はみ出し・無限画像retryがないことを確認する。
- [ ] **Step 5: 認証・公開経路を実ネットワークで検証する。** 学生A/B/教師・未ログイン・logout後・inactive・別roleのGET/HEAD/Range/conditionalを試す。公開Storageパス、通常JWTでのStorage直接取得/一覧/変更を拒否することを確認する。署名付きURL・secret・`/_next/image` 経由がないことを調べる。開発Cookie経路と実Supabaseログイン経路を区別し、production buildで開発認証が無効なことも確認する。実ログイン用資格情報が足りない場合はその項目を未検証として残す。
- [ ] **Step 6: 全体検証を実施する。** `node --import ./tests/helpers/register-title-tests.mjs --test tests/*.test.mjs`、`npm run lint`、`npm run typecheck`、`npm run build` を実行する。Windowsのsandbox制限で必要な場合は適切な昇格で再実行する。ビルドによるPrisma生成差分を既存変更と混同しない。失敗・skip・既存警告・疑似検証/実検証を分けて検証記録へ残す。
- [ ] **Step 7: 差分と設計適合をレビューする。** 指定方式に従い独立レビューを行う。必要な修正後だけ関連テストを再実行する。変更ファイル別にUTF-8/BOM/改行を再確認し、日本語の代表行と差分を検証する。既存dirtyファイルの保護を確認し、Task 8の対象だけをstageして `test: verify private student avatar integration` でコミットする。
- [ ] **Step 8: 本番準備の結果を提示する。** 実装・実検証済み/未検証・必要な本番secret/bucket/RLS・DBとStorageのバックアップ・復旧手順・push対象コミットを一覧にする。本番設定・push・deployの承認を得てから反映する。テストsecretをVercel本番へ転記しない。

## 自己レビューと受入判定

- 設計書§1–3・6・10 → Task 1・6・8、§5 → Task 2、§8 → Task 3・7、§7 → Task 4、§4 → Task 5、§9 → Task 6、§11–12 → Task 7・8で実装/確認する。
- Review Focusの5条件はそれぞれTaskの具体的テストへ割り当て済み。管理外参照の再アップロード、commit結果不明、遅延decode、広いRLS、遅延me応答を省略しない。
- StorageとDBの同時成功を仮定しない。未知のエラーは未保存/rollback済みと断定しない。すべてのmutationと後片付けは同じRepositoryの照合ルールを使う。
- 自動清掃・新規テーブル・教師編集・Google写真同期・回転/加工・リアルタイム反映を追加しない。
- 本計画は未実装。チェック欄と検証記録が完了条件の根拠であり、文書作成だけで機能が動作すると扱わない。
