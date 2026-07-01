<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Text Encoding Rules

## Scope
This repository may contain Japanese text and mixed legacy encodings.
Avoid mojibake and accidental re-encoding above all else.

## Mandatory Rules
- Before reading or editing an existing text file that may contain Japanese, first determine:
  - likely encoding
  - BOM presence
  - newline style
- If mojibake is suspected, do not save the file until the encoding interpretation is credible.
- Preserve the original encoding, BOM, and newline style for existing files.
- Treat "convert to UTF-8" as a separate, explicit task.
- New files should follow repository convention. If there is no clear rule, prefer UTF-8 and state whether BOM is used.
- Do not use ambiguous write paths by default, such as shell redirection or convenience commands without explicit encoding control.
- After writing, reopen the file and verify representative Japanese lines.
- If any of the following appears, stop and report:
  - replacement characters
  - unexpected `?`
  - unintended BOM change
  - unintended newline conversion
  - whole-file diffs without a business reason

## Reporting Format
For each changed text file, report:
- path
- detected or preserved encoding
- BOM presence
- newline style
- how verification was performed
- whether representative Japanese text remained intact

## プロジェクト概要

このプロジェクトは、ITパスポート試験・基本情報技術者試験の過去問を学習できるWebアプリです。
学生が継続的に学習できるように、過去問練習、模擬試験、ポイント、称号、ランキング、掲示板機能を実装します。

アプリ名は「目指せ合格！過去問くん」です。

### 主なユーザー

* 学生

  * Googleアカウントでログインする
  * 一問一答、過去問練習、模擬試験、ランキング確認、称号交換、掲示板利用を行う

* 教師

  * 事前に用意された共通アカウントでログインする
  * 管理者相当の権限を持つ
  * 学生の進捗確認、模擬試験管理、過去問データ登録、掲示板確認を行う

### 技術スタック

* フロントエンド: Next.js / TypeScript / Tailwind CSS
* バックエンド: Next.js API Routes
* ORM: Prisma
* データベース: Supabase PostgreSQL
* デプロイ: Vercel

### 実装方針

* 開発はバックエンドとDB設計を優先する
* DBアクセスはPrisma経由で行う
* 学生と教師は `role` で判定する
* 学生のGoogleログイン後、初回ログイン時に学生プロフィールを自動作成する
* 教師は共通アカウントでログインし、教師管理画面へ遷移する
* セキュリティや外部ユーザー制限は今回の実装では重視しない
* リアルタイムチャットは実装せず、掲示板形式にする

## コマンド

プロジェクトで使用する主なコマンドは以下の通りです。

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# lint実行
npm run lint

# 型チェック
npm run typecheck

# Prisma Client生成
npx prisma generate

# DBスキーマ反映
npx prisma db push

# Prisma Studio起動
npx prisma studio
```

`npm run typecheck` が存在しない場合は、`package.json` に以下のようなスクリプトを追加することを検討してください。

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

ただし、スクリプト追加が必要な場合は、事前に確認してください。

## 権限

### 自動実行OK

以下の操作は、確認なしで実行してよいです。

* lint
* 単一テスト
* 型チェック

例:

```bash
npm run lint
npm run typecheck
npm test -- <対象ファイル>
```

### 確認が必要

以下の操作を行う前には、必ず確認してください。

* パッケージ追加
* パッケージ削除
* `package.json` の依存関係変更
* `git push`
* 大きなDBスキーマ変更
* 既存仕様を大きく変える変更

例:

```bash
npm install <package>
npm uninstall <package>
git push
```

## 困ったら

要件が曖昧な場合は、推測で大きな変更をしないでください。
実装方針が複数考えられる場合は、勝手に決めずに質問してください。

特に以下の場合は確認してください。

* DB設計を大きく変更する必要がある場合
* 画面構成を変更する必要がある場合
* ログイン仕様を変更する必要がある場合
* 学生・教師・管理者の権限に関わる変更をする場合
* 新しいライブラリを追加する必要がある場合

小さな修正、明らかなバグ修正、lint修正、型エラー修正は進めて問題ありません。
ただし、既存の要件定義と違う実装になりそうな場合は、作業前に確認してください。

<!-- END:nextjs-agent-rules -->
