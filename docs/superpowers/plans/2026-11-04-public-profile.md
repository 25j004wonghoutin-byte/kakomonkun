# Public Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ランキングの名前・アイコンから専用プロフィールへ移動し、試験・月を保って戻れる。
**Architecture:** /users/[userId] を公開プロフィールの正規画面とし、既存の公開データ取得・投稿操作を共用する。型付きの内部戻り先ヘルパーをサーバーと画面で共有する。
**Tech Stack:** 既存の Next.js 16.2.9 / React / TypeScript / Prisma、追加依存なし。
**Spec:** docs/superpowers/specs/2026-11-04-public-profile-design.md

## Global Constraints
- 公開項目・認証・教師権限は維持。本番変更やpushはこの実装では行わない。
- 全変更テキストはUTF-8、BOMなし、CRLF。既存のPrisma生成物の差分は触らない。
- 既存の作業用worktreeで実装する。実装は自身で行い、最後に一度の独立レビュー。

## Review Focus
- 過去月・FEからの戻り先保持：Task 1と2でテスト。
- 非公開利用者・不正なUUID・未ログイン：Task 2とブラウザーで確認。
- 外部・不正な戻り先：Task 1で許可リストと既定値をテスト。
- 教師の固定表示・既存の投稿操作：既存テストとTask 2で確認。
- 390px・長い名前・アバターのない利用者・キーボード：Task 3で画面検証。

### Task 1: 戻り先とランキング導線
**Files:** src/lib/public-profile-navigation.ts、src/lib/mock-exams/ranking.ts、src/app/ranking/ranking-view.tsx、tests/public-profile-navigation.test.mjs、tests/mock-ranking-render.test.mjs、tests/mock-ranking.test.mjs。
**Interfaces:** getProfileReturnTarget(value: unknown): {href: string;label: string}、getPublicProfileHref(userId: string, returnTo?: string): string。
- [x] 戻り先の正規化とランキングの名前・画像リンクを表すテストを追加して失敗確認。
- [x] 内部戻り先だけを許可し、ランキングの選択中の試験・月を付与。ボタンをなくし名前と画像を一つのリンクにする。
- [x] 対象テストを実行して成功確認。

### Task 2: 専用画面と既存リンク移行
**Files:** src/app/users/layout.tsx、src/app/users/[userId]/page.tsx、src/app/users/[userId]/loading.tsx、src/components/public-user-profile.tsx、既存boardプロフィール・post-card・reply-dialog・post-detail、関連tests。
**Interfaces:** PublicProfile({initialProfile,viewerName,backTarget?}) は既存公開データと投稿操作を維持。PostCardとBoardAuthorNameは任意のprofileReturnToを受け取る。
- [x] 新画面の戻るリンク・既存公開内容のレンダーテストを追加して失敗確認。
- [x] 共通画面を移し、認証済みRoleShellと独立した経路を追加。旧URLを互換リダイレクトし、掲示板のリンクを更新。
- [x] 既存の表示・権限テストも含めて実行し成功確認。

### Task 3: 検証と報告
**Files:** output/public-profile-20261104/、docs/operations/public-profile-20261104.md。
- [x] 専用検証DBの一時利用者でランキング→プロフィール→戻るをPC/スマホで実操作。FE・過去月・掲示板・投稿詳細・旧URL・404・未ログイン・投稿操作も確認。終了時に一時データを削除。
- [x] 全体テスト、lint、型確認、Next本番ビルドを実行。文字コードのファイル別記録を保存。
- [x] 独立レビューを一度実施し必要な修正と再検証。ローカルの結果と画面を報告。

追加Task：バナー色の本人保存API、共通バナー編集UI、プロフィールの色取得、最小のDB列追加を実装。名前・自己紹介・称号・ポイントの更新処理には混ぜない。入力と権限の単体テスト後、検証DBだけに移行SQLを適用し、実操作で保存・キャンセル・他者非表示・マイページとの一致を確認する。

完了：本番用ビルドと通常認証で11項目成功、画面エラー0。追加撮影の残分は作成記録と照合して削除し、全実行分の残数0を確認。GitHub・本番は未反映。

本番反映の追加承認（2026-11-04）：ユーザーの「反映して。」により、確認済みのバナー列追加・GitHub mainへの同期・Vercel本番更新を実施する。上記の未反映状態は実装完了時点の記録。
