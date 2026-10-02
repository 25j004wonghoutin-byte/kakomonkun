# 称号機能 検証・引継ぎ（2026-10-02）

## 実装範囲

固定66称号（初期1・ポイント33・条件32）。条件達成は永久購入資格であり、無料でも購入確認が必要。購入で自動装備しない。ランキング7種類は定義・条件表示のみで判定無効。履歴のない旧ランダム・名前変更・画面往復、未観測の利用なし/回答なしは推定せず、記録開始後に判定する。初回ショップで既存の証明できる履歴を遡及判定する。

既存DB・所有・装備・購入/回答履歴を削除、初期化、返金していない。適用直前/直後の13テーブル内容一致はSpecのDB適用結果に記録。ブラウザーでの通常利用は新規の利用記録・遡及資格・通知を生成するため、その後まで件数不変という意味ではない。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| 全テスト | 187/187 PASS（ワーカー起動EPERMのためtest-isolation=none） |
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
- 最終whole-branch reviewと重要指摘の修正結果を本報告末尾に追記予定。pushは未実行。

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
| C:/Users/WONGHOUTIN/Documents/kakomonkun/docs/superpowers/reports/2026-10-02-title-conditions-verification.md | UTF-8 | なし | CRLF | 本報告の見出し・日本語を再読 |

意図しないBOM変更、文字置換、文字コード変換はない。ソース差分は業務変更に対応する局所差分。ビルド生成物の既存未コミット差分は意味上の変更なしを確認してステージしない。
