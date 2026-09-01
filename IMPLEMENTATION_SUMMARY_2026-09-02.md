# kakomonkun 今回対話の実装内容まとめ

更新日: 2026-09-02
対象リポジトリ: `https://github.com/25j004wonghoutin-byte/kakomonkun`
対象ブランチ: `main`
実装範囲の主なコミット: `bd0b500` から `48d0b37` まで
アプリ名: **目指せ合格！過去問くん**

## 1. この文書の目的

この文書は、今回の対話で確認・修正・追加した内容を、後から実装経緯まで追えるようにまとめたものです。

別環境や新しい対話で作業を再開する場合は、あわせて `HANDOFF_NEXT_CHAT_2026-09-02.md` を優先して読んでください。以前の `HANDOFF_MIGRATION_2026-07-13.md` と `PROJECT_STATUS_AND_PLAN.md` は履歴資料として残っていますが、現在の実装状態とは差があります。

## 2. 今回の主要コミット

| コミット | 内容 |
| --- | --- |
| `bd0b500` | 学生セッション修正、AI関連テーブルのRLS有効化、ワークスペースルート設定 |
| `acddb01` | 一日一問とランダム出題の分離・実装 |
| `a198590` | 過去問練習拡張、マイページ初期実装、開発資料追加 |
| `76a2f45` | Prisma実行時接続をTransaction mode向けに変更 |
| `7916dc6` | マイページ第2段階、学習状況詳細、過去問練習UI、回答アニメーション |
| `48d0b37` | IPA公式ITパスポート公開問題600問と原題画像の追加 |

最新のGitHub反映済みコミットは `48d0b37 feat: add IPA official question archive` です。

## 3. セキュリティとSupabase

### 3.1 AI関連テーブルのRLS

`public.ai_explanations` と `public.ai_usage_logs` に対して、次のマイグレーションを追加しました。

```text
supabase/migrations/20260823151656_enable_rls_ai_tables.sql
```

内容は両テーブルのRLS有効化です。現時点ではクライアント向けRLSポリシーを作成していません。

現在の意図は次のとおりです。

- ブラウザからSupabase Data APIを通じて直接読み書きさせない。
- AI解説の取得・保存はNext.js API RouteからPrisma経由で行う。
- `ai_explanations` の既存キャッシュはサーバー側Prismaから引き続き読める。
- `ai_usage_logs` の記録もサーバー側で継続する。
- anonまたは通常のauthenticatedクライアントからは、ポリシーがないためアクセスできない。

したがって、現在のアプリ経路ではRLS有効化後も既存AI解説の読み込みに影響しない設計です。ただし、将来ブラウザから直接参照する設計へ変更する場合は、目的を限定したRLSポリシーが必要です。

### 3.2 認証・学生セッション修正

ローディング中や練習画面で右上に既定名の「学生」が先に表示される問題を修正しました。

- `StudentShell` が `/api/me` の完了前に架空の学生名を確定表示しないよう調整。
- 練習ページへ移動しても実際のログインユーザー名を保持。
- 学生プロフィールが欠けている場合は、認証処理で補完。
- 開発用 `test-student` ログインでユーザーと学生プロフィールを確実に作成。
- 開発用ログインAPIが失敗時にもJSONレスポンスを返すよう修正し、`Unexpected end of JSON input` を防止。
- 開発用Cookieは `kakomonkun_dev_user_id`。本番では開発用ログインを無効化。

この修正により、練習完了時にログインユーザーを見失い、ポイントが付与されない問題も解消しました。

### 3.3 秘密情報の扱い

- `.env` や接続文字列はGitへコミットしていません。
- Supabaseの秘密鍵をブラウザ側へ渡す実装はありません。
- 新環境でも既存のSupabase DBを削除・初期化しないでください。
- 適用済みマイグレーションは変更せず、追加変更は新規マイグレーションで行います。

## 4. Next.jsとワークスペース設定

複数の `package-lock.json` が検出され、Next.jsが `C:\Users\Ten` をワークスペースルートとして誤認する警告に対応しました。

`next.config.ts` に次を設定しています。

```ts
turbopack: {
  root: path.resolve(__dirname),
}
```

これにより、`C:\Users\Ten\Desktop\WorkSpace\kakomonkun` のみをTurbopackのルートとして扱います。

## 5. PrismaとSupabase接続方式

Vercelとローカルで発生した次のエラーを調査しました。

```text
(EMAXCONNSESSION) max clients reached in session mode
```

現在は接続用途を分離しています。

- `DATABASE_URL`: アプリ実行時。Supabase Transaction mode接続を使用。
- `DIRECT_URL`: Prisma CLI、マイグレーション、管理処理。直接接続またはSession mode接続を使用。
- `prisma.config.ts`: `DIRECT_URL` を参照。
- `src/lib/prisma.ts`: `DATABASE_URL` を参照。
- `PrismaPg` の実行時プール上限は `max: 1`。
- 開発時は `globalThis` にPrisma Clientを保持し、Hot Reloadによる多重生成を抑制。

これにより、Vercelのサーバーレス実行でSession modeの接続数15件を使い切る問題を避けています。

## 6. 一日一問とランダム出題

### 6.1 ランダム出題

以前ホームにあった、更新するたびに別問題へ切り替えられる一問一答を `/random-quiz` へ移動しました。

現在の仕様:

- ログイン済みユーザーが利用できる。
- ランダムに1問出題。
- 回答後に正誤と解説を表示。
- 何度でも次の問題へ更新できる。
- 回答履歴を保存しない。
- ポイントを付与しない。

### 6.2 ホームの一日一問

ホームには日付単位で固定される本来の一日一問を実装しました。

現在の仕様:

- `Asia/Tokyo` の日付を基準に毎日1問を決定。
- roleに依存せず、ログイン済みユーザーが回答可能。
- 同じユーザーは同じ日に1回だけ回答可能。
- 回答済み状態は `daily_qa_answers` に保存。
- 学生プロフィールを持つユーザーは回答で1pt、正解で追加1pt。
- 既に回答済みの場合は保存済み結果を返し、二重付与しない。

主要ファイル:

```text
src/app/page.tsx
src/app/random-quiz/page.tsx
src/app/api/daily-qa/route.ts
src/app/api/daily-qa/answer/route.ts
src/app/api/random-quiz/route.ts
src/components/quiz-question-card.tsx
src/lib/quiz-question.ts
src/lib/tokyo-date.ts
```

## 7. 過去問練習

### 7.1 試験・分野・問題数

現在選択できる試験:

- ITパスポート
- 基本情報技術者

分野選択は基本情報技術者を選んだ場合だけ表示します。

- 指定なし
- テクノロジ
- マネジメント
- ストラテジ

「指定なし」は3分野から問題数ができるだけ均等になるように選びます。ITパスポートでは分野選択を行いません。

問題数は次の2種類です。

- 30問
- 60問

年度・季節フィルター、出題モード切替は現時点では実装していません。

### 7.2 セッション動作

- 問題をランダム選択し、セッション内の出題順を固定。
- 回答を都度保存。
- 回答後すぐに正誤、正解、解説、AI解説導線を表示。
- ページを離れても「続きから」で再開可能。
- 途中セッション一覧に「終了する」機能を追加。
- 途中終了時は回答済み分の結果を保存するが、完了ポイントは付与しない。
- 未完了時の結果文言は「未完了なため、ポイントを獲得できませんでした。」。
- APIレスポンスが空または非JSONでも、生の `Unexpected end of JSON input` を画面へ出さない共通読込処理を追加。

### 7.3 ポイント仕様

全問回答した学生セッションに対する基本ポイント:

- 30問: 5pt
- 60問: 15pt

追加ボーナス:

- 正解10問ごとに1pt。
- 例: 27問正解なら2pt。
- ユーザー要望により、この正解数ボーナスは維持。

日次制限:

- 基本の練習完了ポイントは `Asia/Tokyo` 基準で1日2セッションまで。
- 正解数ボーナスは、全問回答していれば基本ポイントとは別に計算。

### 7.4 UI調整

- 試験カードの `EXAM` 表記を削除。
- 画面下部の説明3項目を削除。
- 「練習を開始する」ボタンを選択内容の右側へ配置。
- 選択中コースの説明に獲得可能ポイントを表示。
- 結果画面の文字だけの丸アイコンを削除。
- 中断セッションから再開・終了できる構成へ変更。
- 文字アイコンを新規に使わない方針を反映。

主要ファイル:

```text
src/app/practice/page.tsx
src/app/practice/[sessionId]/page.tsx
src/app/practice/[sessionId]/result/page.tsx
src/app/api/practice/sessions/route.ts
src/app/api/practice/sessions/[sessionId]/route.ts
src/app/api/practice/sessions/[sessionId]/answer/route.ts
src/app/api/practice/sessions/[sessionId]/finish/route.ts
src/lib/practice-config.ts
src/lib/read-json-response.ts
```

## 8. マイページ

`/profile` に学生向けマイページを実装し、上部ユーザーメニューとサイドバーから移動できるようにしました。

### 8.1 マイページ概要

- 表示名、ユーザー名、自己紹介。
- 表示名と自己紹介の編集。
- 所持ポイント。
- 練習完了回数。
- 総回答数。
- 総合正答率。
- 総合・今月の表示切替。
- 分野別正答率。
- 最近の学習。
- 現在装備中の称号。
- 所持称号一覧と装備変更。
- 最近のポイント履歴。
- 読込中画面とエラー画面。

### 8.2 学習状況詳細

`/profile/learning` に次を実装しました。

- 期間フィルター。
- 試験フィルター。
- 正答率推移。
- 分野別集計。
- 過去問練習履歴。
- 結果画面へのリンク。
- ページネーション。
- PC・モバイル向けレスポンシブ表示。

### 8.3 称号

現時点で実装済み:

- DBに存在する所持称号の表示。
- 所持称号の装備変更。
- 装備中称号のマイページ表示。

未実装:

- `/titles` の称号ショップ画面。
- ポイントを使った称号購入。
- 称号獲得条件の自動判定。
- 称号マスタ管理画面。

### 8.4 確定したUI方針

- 「Googleアカウントの画像と連携」という説明文は表示しない。
- `P`、`回`、`問`、`%`、`練` など、文字をアイコン枠へ入れた装飾は使わない。
- ユーザー本人を表す通常の人物アイコンは残す。
- 小さなパネル内で過度に大きな見出しを使わない。
- カードの中へ別カードを重ねない。

主要ファイル:

```text
src/app/profile/page.tsx
src/app/profile/profile-dashboard.tsx
src/app/profile/loading.tsx
src/app/profile/error.tsx
src/app/profile/learning/page.tsx
src/app/profile/learning/learning-filters.tsx
src/app/api/profile/route.ts
src/app/api/profile/equip-title/route.ts
src/lib/profile-data.ts
src/lib/profile-learning-data.ts
src/components/student-shell.tsx
```

## 9. 回答時の正誤アニメーション

ランダム出題、一日一問、過去問練習で、回答時のフィードバックアニメーションを追加しました。

- 正解選択肢の強調とチェック表示。
- 不正解選択肢の短い揺れ。
- 不正解時に正解選択肢を少し遅れて表示。
- 結果パネルの出現アニメーション。
- `prefers-reduced-motion` を尊重し、動きを減らす設定ではアニメーションを無効化。

HyperFramesで作成した検討用プレビューは `videos/answer-feedback-motion/` に保存しています。実際のアプリ実装は `src/app/globals.css` とReactコンポーネント内のCSSクラスで行い、HyperFrames実行環境への依存は追加していません。

## 10. IPA公式ITパスポート公開問題

IPAが公開している2021年から2026年のITパスポート公開問題を取り込みました。

### 10.1 取り込み数

| 年度 | 問題数 |
| --- | ---: |
| 2021 | 100 |
| 2022 | 100 |
| 2023 | 100 |
| 2024 | 100 |
| 2025 | 100 |
| 2026 | 100 |
| 合計 | 600 |

生成済みシード全体:

- ITパスポート: 631問
- 基本情報技術者: 2,000問
- 合計: 2,631問

### 10.2 表示方式

OCR文字化も検証しましたが、問題文の品質が原題画像より大きく落ちたため、最終的に画像表示へ戻しました。

現在の仕様:

- 公式600問は `official_scan` として原題画像を表示。
- 画像内に問題番号、問題文、選択肢本文が含まれる。
- アプリ側は `ア`、`イ`、`ウ`、`エ` の選択ボタンだけを表示。
- OCR文字や「原題画像を参照」のプレースホルダーは画面へ表示しない。
- 出典年度、問題番号、IPA公開問題であることを表示。
- 通常のテキスト問題は従来どおり文字表示。

### 10.3 データと画像

```text
kakomon/ipa-it-passport-2021-2026.json
public/kakomon/img/ipa/2021/q001.webp ... q100.webp
public/kakomon/img/ipa/2022/q001.webp ... q100.webp
public/kakomon/img/ipa/2023/q001.webp ... q100.webp
public/kakomon/img/ipa/2024/q001.webp ... q100.webp
public/kakomon/img/ipa/2025/q001.webp ... q100.webp
public/kakomon/img/ipa/2026/q001.webp ... q100.webp
supabase/generated-question-seed.json
```

画像は600枚、約33MiBです。最大の単一ファイルはGitHubの通常上限を十分下回っています。

### 10.4 インポート・検証

```text
scripts/import-ipa-it-passport.py
scripts/build-question-seed.mjs
scripts/upsert-question-seed.mjs
scripts/verify-ipa-question-import.mjs
src/lib/official-question.ts
```

Supabaseへの同期時に確認した結果:

- 公式問題: 600問
- 公式選択肢: 2,400件
- 画像パス設定済み: 600問
- 不正な公式問題: 0件
- 年度別: 各100問

## 11. 最終確認結果

最新実装で実行・確認済み:

- `python -m py_compile scripts/import-ipa-it-passport.py`
- `npm run typecheck`
- 変更対象へのESLint
- `npm run build`
- `git diff --check`
- Supabase公式問題検証スクリプト
- ローカルブラウザで公式画像問題を表示
- 画像の縦横比が自然画像と画面表示で一致
- 公式画像問題でOCR本文が二重表示されないことを確認
- ブラウザコンソールエラーなし
- 練習ページとAPIがHTTP 200を返すことを確認

## 12. 現在未完成または次段階の機能

優先度高:

1. 称号ショップと称号購入。
2. 称号獲得条件の設計・自動付与。
3. マイページと学習履歴の実データによる追加検証。
4. 過去問練習の復習機能、間違えた問題の再出題。
5. Vercel上で600枚の問題画像と最新練習導線を確認。
6. `.env.example` に `DIRECT_URL` の説明を追加するか検討。

優先度を下げている機能:

- 模擬試験。
- 月間ランキング。

未実装:

- 教師ダッシュボードと本格的な教師共通アカウント認証。
- 掲示板。
- お知らせ・通知。
- 問題管理画面。
- 称号ショップ。
- 月間ランキング画面。

## 13. 実装時に守る仕様

- マイページと称号を優先し、模擬試験・月間ランキングの優先度は低くする。
- 過去問練習の問題数は当面30問と60問だけ。
- 年度・季節フィルターと出題モード切替は、明示的な再確認なしに追加しない。
- 分野選択は基本情報技術者だけに表示。
- ランダム出題ではポイントを付与しない。
- 一日一問は日付単位で固定し、roleに依存させない。
- 30問完了は5pt、60問完了は15pt。
- 正解10問ごとのボーナスを維持する。
- IPA公式600問は原題画像表示を維持する。
- 文字をアイコンとして使うUIは追加しない。
- ユーザー本人を表す人物アイコンは残す。
- Supabase既存データと適用済みマイグレーションを削除・初期化しない。
