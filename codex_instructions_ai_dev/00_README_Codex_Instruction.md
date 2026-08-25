# Codex向け指示書 README

## 目的

このフォルダは、資格試験学習アプリを実装するために、Codexへ読ませる前提資料である。  
これまでのチャットで整理した最新方針を、実装しやすいMarkdown形式に再整理している。

## プロジェクト概要

学生が **ITパスポート** と **基本情報技術者試験** の過去問を学習できるWebアプリを作成する。  
通常の過去問練習だけではなく、**一問一答、模擬試験、ランキング、ポイント、称号ショップ、掲示板、教師管理機能** を持つ。

学習のモチベーション維持のため、特に **ポイント機能** と **称号機能** を重要機能として扱う。

## 技術スタック

| 区分 | 採用技術 |
|---|---|
| フロントエンド | Next.js / React / Tailwind CSS |
| バックエンド | Next.js API Routes / Route Handlers |
| DB | Supabase PostgreSQL |
| ORM | Prisma |
| 認証 | Supabase Authを想定。ただし、アプリ側ではusers/profilesで管理する |
| ホスティング | Vercel |
| 開発方針 | バックエンド・DBから先に実装する |

## 重要な前提

- PrismaはDBを直接入力する道具ではなく、Next.js APIからDBへアクセスするためのORMとして使う。
- 画面からDBへ直接アクセスしない。必ずNext.js APIを通す。
- 掲示板はリアルタイムチャットではない。投稿・コメント型の掲示板として実装する。
- 教師は管理者相当の権限を持つ想定だが、roleとしては `student / teacher / admin` を分ける。
- 問題カテゴリは大分類のみでよい。
  - テクノロジ系
  - マネジメント系
  - ストラテジ系
- 一問一答と過去問練習は別機能として扱う。
- お知らせと通知は別機能として扱う。
- ランキング結果は `monthly_rankings` のような月別ランキングテーブルへ保存する。

## 実装順序

Codexは以下の順で進める。

1. Prisma schema作成
2. Supabase PostgreSQLへのマイグレーション
3. seedデータ作成
4. バックエンドAPI作成
5. 最低限のフロント画面作成
6. 画面遷移の接続
7. ポイント・称号・ランキングの動作確認
8. Vercelデプロイ対応

## DB実装の優先順位

### 優先度1

- users
- roles
- profiles
- exams
- question_categories
- questions
- question_choices

### 優先度2

- daily_qa_answers
- practice_sessions
- practice_answers
- mock_exams
- mock_exam_questions
- mock_attempts
- mock_answers
- point_transactions
- titles
- user_titles
- monthly_rankings

### 優先度3

- board_posts
- board_comments
- announcements
- notifications
- user_notifications
- audit_logs
- point_rule_configs

## 最初に実装する学生フロー

最初に確認すべき最小フローは以下。

```text
ログイン
  ↓
過去問練習を開始
  ↓
DBから問題を取得して表示
  ↓
学生が回答
  ↓
正誤判定
  ↓
回答履歴を保存
  ↓
条件に応じてポイント加算
```

## Prismaに関する注意

Vercelビルド時に `@prisma/client` から `PrismaClient` が見つからないエラーが出ないように、基本は標準構成を使う。

推奨:

```prisma
generator client {
  provider = "prisma-client-js"
}
```

TypeScript側:

```ts
import { PrismaClient } from "@prisma/client";
```

カスタム出力先を使う場合は、import先とtsconfigのpath aliasを必ず一致させる。  
ただし、このプロジェクトではまず標準構成を推奨する。

## このフォルダのファイル構成

| ファイル | 内容 |
|---|---|
| `01_ProjectPlan_Requirements.md` | プロジェクト計画書・要件定義書 |
| `02_ScreenTransitions_List_Mockups.md` | 画面遷移表・画面一覧表・簡易モック |
| `03_DB_Priority1_Core_and_Questions.md` | 優先度1のDBテーブル |
| `04_DB_Priority2_Learning_Gamification.md` | 優先度2のDBテーブル |
| `05_DB_Priority3_Board_Admin.md` | 優先度3のDBテーブル |
| `06_ER_Diagram.md` | Mermaid形式のER図 |
| `07_Codex_Implementation_BackendFirst.md` | Codexへの具体的な実装指示 |
