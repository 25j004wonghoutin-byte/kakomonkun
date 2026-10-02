# 称号機能 検証・引継ぎ（2026-10-02）

## 実装範囲

固定66称号（初期1・ポイント33・条件32）。条件達成は永久購入資格であり、無料でも購入確認が必要。購入で自動装備しない。ランキング7種類は定義・条件表示のみで判定無効。履歴のない旧ランダム・名前変更・画面往復、未観測の利用なし/回答なしは推定せず、記録開始後に判定する。初回ショップで既存の証明できる履歴を遡及判定する。

既存DB・所有・装備・購入/回答履歴を削除、初期化、返金していない。適用直前/直後の13テーブル内容一致はSpecのDB適用結果に記録。ブラウザーでの通常利用は新規の利用記録・遡及資格・通知を生成するため、その後まで件数不変という意味ではない。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| 全テスト | 最終レビュー修正後194/194 PASS（ワーカー起動EPERMのためtest-isolation=none） |
| npm run typecheck / npm run lint | PASS |
| npm run build | PASS（Prisma7.8生成・Next16.2.9ビルド。公式エンジンダウンロードと子プロセス起動のみsandbox外で承認実行） |
| 対象ソース・テスト・docs・SQLのdiff --check | PASS |
| Supabase読み取り整合 | 固定キー66/重複0、新4テーブルRLS有効/ポリシー0、CHECK検証済み、部分回答0、負価格/負残高0、資格/回答順重複0 |
| 仮想長期実績 | 365日、ランダム200連続、固定58所有、過去3連続後失敗、JST、未観測期間、再送、通知失敗rollbackをサービス境界で検証 |
| ブラウザー | PC1440×1000/モバイル390×844、66カード、条件詳細/Escape/フォーカス復帰、無料確認/取消、ポイント不足、装備と31pt維持、遡及通知再訪重複なし、教師ショップ非表示/利用API403、consoleエラー0 |

ブラウザーはプラグイン不在のため既存のbundled Playwright1.62.1とインストール済みChromeを使用。依存追加なし。既存開発認証cookieで学生/教師を確認し、ログインによる名前更新を避けた。購入は送信せず確認で取消した。

## 未検証・次の作業

- **専用テストDB未指定のため実PostgreSQLの同時回答/同時購入/answer-finish競合と通知失敗rollbackは未実施。** メモリー境界の直列化テストは実DB競合の証明ではない。本番Supabaseに競合用データを投入しない。
- 実ブラウザーで購入確定、新規学生作成、5往復、名前変更、自己返信、ランダム履歴保存の各変更操作は行っていない。自動テストで実サービスロジックを検証した範囲と区別する。
- ランキング7種類は月間ランキングの確定履歴実装待ち。プロフィールアイコンアップロードは今回対象外。
- 価格は暫定。ユーザーの最終一覧に合わせる別作業。
- 最終whole-branch reviewの重要3件を再現テストで修正。詳細は本報告末尾。pushは未実行。

## ファイル別文字コード検証

全件をstrict UTF-8で再読し、BOM・CRLF/LF・U+FFFDを検査。下表の日本語代表行を確認し、称号名と表示文はテストでも検証した。全件BOMなしを維持。新規手書きはUTF-8/BOMなし/CRLF、Prisma生成物はLF。既存の通知write.tsはLF、StudentShellと練習answer routeは元の混在改行を未変更行ごとに維持した。ビルドで戻った新規4生成モデルの末尾空白だけを再整形し、既存13生成ファイルの事前からの空白差分は残した。

| 絶対パス | 文字コード | BOM | 改行 | 日本語検証 |
| --- | --- | --- | --- | --- |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/docs/superpowers/plans/2026-10-01-title-conditions-implementation.md | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/docs/superpowers/specs/2026-10-01-title-conditions-design.md | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/browser.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/client.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/commonInputTypes.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/internal/class.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/internal/prismaNamespace.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/internal/prismaNamespaceBrowser.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/Question.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/QuestionChoice.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/RandomQuizAttempt.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/StudentActivityDay.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/StudentNavigationProgress.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/StudentProfile.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/Title.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/User.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/generated/models/UserTitleUnlock.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/prisma/schema.prisma | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/daily-qa/answer/route.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/practice/sessions/[sessionId]/answer/route.ts | UTF-8 | なし | 混在 CRLF36/LF4 | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/practice/sessions/[sessionId]/finish/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/profile/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/random-quiz/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/titles/activity/route.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/api/titles/purchase/route.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/random-quiz/page.tsx | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/titles/page.tsx | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/titles/title-shop-parts.tsx | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/app/titles/title-shop.tsx | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/components/student-shell.tsx | UTF-8 | なし | 混在 CRLF341/LF10 | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/components/title-activity-tracker.tsx | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/board/write-comments.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/board/write-posts.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/notifications/contract.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/notifications/write.ts | UTF-8 | なし | LF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/starter-title.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/activity-client.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/activity.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/catalog.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/community-events.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/contract.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/facts.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/learning-events.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/purchase.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/random-attempts.ts | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/rules.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/shop.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/src/lib/titles/unlocks.ts | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/supabase/migrations/20261001000000_title_conditions.sql | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/board-comment-rules.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/fixtures/title-facts.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/helpers/learning-memory.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/helpers/register-title-tests.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/helpers/title-memory.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/notifications-contract.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/random-attempts.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-activity-client.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-activity.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-answer-events.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-catalog.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-community-events.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-facts.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-purchase.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-rules.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-schema.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-shop-contract.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-shop-render.test.mjs | UTF-8 | なし | CRLF | 代表日本語を再読・正常 |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-unlocks.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-long-history.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/tests/title-locking.test.mjs | UTF-8 | なし | CRLF | 日本語なし |
| C:/Users/WONGHOUTIN/Documents/kakomonkun/docs/superpowers/reports/2026-10-02-title-conditions-verification.md | UTF-8 | なし | CRLF | 本報告の見出し・日本語を再読 |

意図しないBOM変更、文字置換、文字コード変換はない。ソース差分は業務変更に対応する局所差分。ビルド生成物の既存未コミット差分は意味上の変更なしを確認してステージしない。

## 実行中の判断（台帳順・全件）

| 順 | 判断・理由 | 判断が誤っていた場合のコスト |
| --- | --- | --- |
| 1 | ユーザー指定の同じcheckoutで専用ブランチを使用。worktreeを追加しない | 既存変更と混在するため明示パスでステージが必要 |
| 2 | ワーカー起動EPERMによりtest-isolation=noneで実行。既存59テストもこの方式でPASS | テスト間の分離が弱くなる |
| 3 | Bash用手順をWindowsの同等brief/台帳に置換 | 手動の記録漏れリスク |
| 4 | 専用DB未指定のためSQL安全性は構造テストと本番の読み取りメタデータ検証 | 制約違反や競合の実動作までは証明しない |
| 5 | 永久資格の一意性はuser/titleの複合主キーで表現し、重複索引を増やさない | 単独UUIDによる資格行参照はできない（現在の利用なし） |
| 6 | 既存Prisma CLIに.env.localを明示し、公式エンジン取得のみ承認実行 | 公式ホストへの通信が必要。DB操作・依存変更はなし |
| 7 | 既存生成物の事前空白変更を保護し、意味上の追加だけzero-context patchでステージ | 生成物が作業ツリーではdirtyのまま残る |
| 8 | createManyAndReturn(skipDuplicates)で実際に挿入した資格だけ通知 | Prisma7 APIへの依存。追加ライブラリなし |
| 9 | practice書き込みをlearning-eventsに抽出し、API/authのmockと本番テスト書き込みを避ける | 内部ファイルが増える。外部応答/報酬仕様は維持 |
| 10 | 同時刻finishのUUID順で正解連続が変わらないよう、ユーザー内で終了時刻を単調増加 | 密集時は終了時刻が数ミリ秒進む。報酬日は変更しない |
| 11 | profileサービス・boardのPrisma遅延import・携帯可能なclient dispatcherを抽出 | 内部構成が増える。外部契約は維持 |
| 12 | pure shop formatterと実card/dialogを分離し、SSRで表示契約をテスト | 内部ファイルが増える。既存配色/構成は維持 |
| 13 | 実PG競合・本番規模の速度はレビュー判断外として未検証を明示 | 実際の競合/待ち時間は未証明 |
| 14 | 実購入確定・新規学生作成は本番を変更せずレビュー判断外 | 隔離環境での全経路E2Eが必要 |
| 15 | ランキング活性化は承認済み別作業 | 7称号は購入不可のまま |
| 16 | 未記録の旧ランダム/名前/往復は推定しない | 証明できない旧達成は遡及対象外 |
| 17 | 意図的なクライアント改ざんは合意された対策範囲外 | 悪意ある訪問イベントの偽装は防がない |
| 18 | 既存生成物空白・無関係dirtyはレビュー判断外として保持 | 作業ツリーはdirtyのまま |
| 19 | 保存タブIDをdocument寿命のWeb Locksで占有し、非対応ならdocumentごとに新ID | Web Locks非対応の全体再読込では未完の往復をリセット。完了済み往復はDBに保持 |

## 最終レビューと修正

gpt-6-astra/highの新しい文脈で `6fe09d1..00dd3b5` を読み取り専用レビュー。独立に187テストPASS確認。Criticalなし、Important3、Minor2。Importantはすべて一度の修正工程で再現テストRED→GREENを確認し、全194テストPASS。再レビューは重複させていない。

1. 相互返信の受信者FKとusers FOR UPDATEが競合するため、usersをFOR NO KEY UPDATEへ変更。同一学生の書き込み直列化は維持し、他学生のFK参照を許す。両学生の実返信サービスと外部FKロック境界で失敗→成功を検証した。実PG上で競合を実行したという意味ではない。[PostgreSQLのロック互換表](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)に照合。
2. sessionStorageの複製によるタブID衝突を、生きているdocumentのWeb Locks占有で判別。新タブは未完の状態を引き継がず、同じタブの再読込は占有解放後に継続する。[sessionStorageの複製](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)と[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)の仕様を確認。
3. 画面イベントは保存キューで順序送信し、未確認イベントを同じIDで先に再送。前の応答確定と次のenqueueが重なる場合も送信を継続。隠れた再試行ポーリングは追加しない。

実Chrome/同一originの隔離画面で**実クライアント関数**とWeb Locksを使い、複製2タブは2往復、別タブの不完全往復は0、再読込は同じIDで往復継続、遅延profileは1→2→3送信を確認。APIは送信せずDB書き込み0。修正後に実ショップQAも再実行し、PC/モバイル・教師除外・確認取消・console0を再確認した。

### 未対応の軽微事項（全件）

- 活動ごとに全履歴を2回集計するため、将来の大量履歴で集計共有/SQL集約と速度計測が必要。現在は速度やtimeout耐性を保証しない。
- 購入対象title行のFOR UPDATEで無関係な学生も待つ。価格/有効状態を安定させるFOR SHAREへの最適化は後続。通常操作でのtitle単独デッドロックは確認されていないため、重要修正と混ぜていない。

追加/変更の `src/lib/titles/unlocks.ts`、`src/lib/titles/activity-client.ts`、`src/components/title-activity-tracker.tsx`、`tests/title-activity-client.test.mjs`、新規 `tests/title-locking.test.mjs` は全てUTF-8/BOMなし/CRLF。strict再読・改行・U+FFFD検査を実施し、「同一学生」「生きている別タブ」「未送信イベント」などの代表日本語を保持。テスト2件は日本語なし。本報告・Spec・Planも同じ方式で検証した。
