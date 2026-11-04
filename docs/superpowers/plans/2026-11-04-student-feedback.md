# Student Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with superpowers:dispatching-parallel-agents for the independent notification and AI tasks.

**Goal:** 模擬試験の回答反応、通知の一括既読、復習AIを改善する。
**Architecture:** 既存の保存キュー・通知・画像対応AIを拡張し、独立した担当範囲で修正する。
**Tech Stack:** Next.js 16.2.9 / React / TypeScript / Prisma、追加ライブラリなし。
**Spec:** docs/superpowers/specs/2026-11-04-student-feedback-design.md

## Global Constraints
- UTF-8、BOMなし、CRLF。編集前に確認し、保存後に厳密再読・日本語確認する。
- DBスキーマ・パッケージ変更なし。本番更新・pushは結果報告後のユーザーの「push」指示により承認済み。既存のPrisma生成物の差分を保持する。
- まず失敗するテストを確認し、最小修正後に対象テストを実行する。

## Review Focus
- 古い保存応答が新しい選択を巻き戻さない。
- 保存失敗・競合・再試行時に未保存を保存済みと表示しない。
- 通知の先読みは書き込まず、他人・既読済み・新着の通知を誤更新しない。
- AIの回答・問題の版・所有者と画面のアカウント切り替えを確認する。
- AIはクリック時のみ呼び。

### Task 1: 模擬試験の即時選択（root）
**Files:** mock-attempt.tsx、src/lib/mock-exams/answer-drafts.ts、対応tests。
**Interfaces:** サーバー確認済みAttemptViewにquestionId/requestId付きの未確認選択を重ね、対応する応答だけで消す。
- [x] 待機中の表示・古い応答・複数問題のテストをRED→GREEN。
- [x] 通信遅延・連打・保存失敗・再取得・提出で実操作を確認。
- [x] ユーザー指示によりログイン配色を復元し、変更前と差分0を確認。

### Task 2: 通知一覧を開いた時点で全既読（notifications担当）
**Files:** 通知のread/write、read-all API、notification-list、notification-bell、対応tests。
**Interfaces:** 本人・未読・開いた時点以前に限定した一括更新。実マウントからPATCHし、成功時に一覧とベルを同期する。
- [x] 所有・既読・新着・API保護と画面同期をRED→GREENで検証。
- [x] サーバーGETや先読みでは書き込まない。失敗時は未読維持と再試行を可能にする。

### Task 3: 復習ノートAI解説（review_ai担当）
**Files:** review-notebook AI API/serviceとclient/view、対応tests。既存AI生成・QuizQuestionCardを共用する。
**Interfaces:** 本人の公開中の問題に対し、保存済み回答と現在のquestionVersionを検証後、getOrCreateAiExplanationを使用。回答後のボタンからのみ取得する。
- [x] 認証・役割・所有・回答前・版更新・非公開・生成失敗・表示のテストをRED→GREEN。
- [x] 画像の原本を保ち、AIは既存の画像入力を使う。ポイント・成績は更新しない。

### Task 4: 統合確認と報告（root）
**Files:** output/student-feedback-20261104/、docs/operations/student-feedback-20261104.md。
- [x] 全体テスト、変更箇所lint、型確認、ビルド、PC・スマホの実操作。
- [x] 専用検証DBで必要な一時データだけを使い、削除確認を行う。AI生成はテスト時はキャッシュ／スタブで検証し、無断で外部API費用を増やさない。
- [x] 独立レビューを一度実施し、必要な修正を検証。文字コードと結果を記録し、本番反映前に報告。

範囲修正：ログインの色変更はユーザー指示で取り消し。該当CSSはHEADと差分0を確認。残る3機能の検証は有効で、最終ビルドだけ配色復元後に確認する。

完了：3機能の実操作9項目、追加のスマホAI表示確認、617テスト成功、型・lint・配色復元後ビルド成功。検証用データ残数0。本番未変更・pushなし。

公開承認：ローカルの結果報告後、ユーザーが「push」を指示。最終3機能とこの文書をGitHub mainへ反映し、Vercel本番デプロイと公開状態を確認する。
