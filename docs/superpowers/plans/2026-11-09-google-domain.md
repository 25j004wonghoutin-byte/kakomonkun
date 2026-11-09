# Google Domain Restriction Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this small connected change; one independent review at completion.

**Goal:** 新規Googleアカウントをedu.kimura.ac.jpに限定し、既存の他ドメイン利用を維持する。
**Architecture:** ensureAppUserの本人照合後・新規作成前に共通ポリシーを適用する。callbackの拒否は現在のセッションを終了し、ログイン画面の理由へ接続する。
**Tech Stack:** Next.js16.2.9、Supabase SSR、Prisma。追加パッケージ・スキーマ変更なし。
**Spec:** docs/superpowers/specs/2026-11-09-google-domain-design.md

## Constraints
- 既存データと別作業の差分を保持。テキストはUTF-8、BOMなし、CRLF。
- ユーザーの追加回答「既存アカウントだけは例外としてログインを許可する」を優先。
- 本番更新・pushは行わず、ローカル・専用検証環境で確認する。

## Review Focus
- 拒否対象がgetCurrentUserの自動作成で利用者になることを防ぐ。
- メールの似た末尾やサブドメイン、自己申告のメタデータを許可しない。
- 既存の認証ID/メールの競合を例外扱いで緩めない。
- logoutが失敗しても保護ページとログイン画面を往復しない。
- 教師のパスワードログインと既存の成績・ポイント・称号を維持する。

### Task 1: 登録と戻り先の制御
Files: src/lib/google-login-policy.ts、src/lib/auth.ts、src/app/auth/callback/route.ts、tests/google-login-domain.test.mjs、tests/helpers/google-auth-harness.mjs。
- [x] 実際のensureAppUserとcallbackを制御された依存で実行し、拒否前のテスト失敗を確認する。
- [x] 許可ドメインの完全一致を実装し、既存照合・競合保護を維持する。
- [x] domain_not_allowedをcallbackで表示し、scope:localで現在のセッションを解除する。
- [x] 新規許可・新規拒否・既存継続・競合・保存情報・本人取得・失敗処理の対象テストを成功させる。

### Task 2: ログイン画面と拒否の復旧
Files: src/app/login/page.tsx、src/lib/supabase/proxy.ts、tests/google-login-page.test.mjs。
- [x] 現在の表示と自動転送を確認し、拒否の理由を判定するテストを先に書く。
- [x] 新規の条件と既存の例外を表示する。実際のアプリ本人確認後にログイン済みの転送を行う。
- [x] PC・スマホ、拒否メッセージ、残存セッションでも往復なしを確認する。

### Task 3: 全体確認と報告
- [x] 全体テスト、変更箇所lint、型確認、本番用ビルド、ローカルの実画面を確認。
- [x] 独立レビューを一度行い、指摘があれば修正検証。
- [x] 一時データを削除し、ファイル別文字コードと結果を報告。本番未反映。
