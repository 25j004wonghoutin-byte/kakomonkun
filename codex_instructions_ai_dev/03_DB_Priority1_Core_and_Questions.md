# DBテーブル設計 改訂版 優先度1：ユーザー・プロフィール・問題データ

## 1. 方針

最初に実装するべきDBは、ログイン後の学生フローに必要なテーブルである。

最初の実装対象:

```text
users / roles / profiles
exams / question_categories / questions / question_choices
```

この段階で、以下の最小フローを実装できる状態にする。

```text
ユーザー取得
  ↓
過去問練習開始
  ↓
DBから問題取得
  ↓
選択肢表示
  ↓
回答
  ↓
正誤判定
```

## 2. roles

ユーザー権限を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | role ID |
| name | varchar(30) | unique, not null | student / teacher / admin |
| description | text |  | 説明 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

初期データ:

| name | 説明 |
|---|---|
| student | 学生 |
| teacher | 教師。管理者相当の機能を持つ |
| admin | 管理者 |

## 3. users

アプリ内ユーザーを管理する。Supabase Authを使う場合は `auth_user_id` と連携する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | アプリ内ユーザーID |
| auth_user_id | uuid | unique | Supabase AuthのユーザーID |
| role_id | uuid | FK roles.id, not null | 権限 |
| email | varchar(255) | unique, not null | メールアドレス |
| display_name | varchar(100) | not null | 表示名 |
| status | varchar(30) | not null, default active | active / suspended / deleted |
| last_login_at | timestamp |  | 最終ログイン日時 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |
| deleted_at | timestamp |  | 論理削除日時 |

インデックス:

- `users_email_key`
- `users_auth_user_id_key`
- `idx_users_role_id`
- `idx_users_status`

## 4. student_profiles

学生プロフィールを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | uuid | PK, FK users.id | ユーザーID |
| student_no | varchar(50) | unique | 学籍番号など |
| avatar_url | text |  | アイコンURL |
| bio | text |  | 自己紹介 |
| current_title_id | uuid | FK titles.id, nullable | 現在装備中の称号 |
| total_points | integer | not null, default 0 | 現在所持ポイント |
| total_practice_count | integer | not null, default 0 | 過去問練習回数 |
| total_correct_count | integer | not null, default 0 | 累計正解数 |
| total_answer_count | integer | not null, default 0 | 累計回答数 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

注意:

- `current_title_id` は優先度2の `titles` 作成後に外部キーを設定する。
- 初期実装ではnullableでよい。

## 5. teacher_profiles

教師プロフィールを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | uuid | PK, FK users.id | ユーザーID |
| teacher_no | varchar(50) | unique | 教師番号 |
| department | varchar(100) |  | 所属 |
| avatar_url | text |  | アイコンURL |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

## 6. exams

対応試験を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 試験ID |
| code | varchar(50) | unique, not null | it_passport / fe |
| name | varchar(100) | not null | 試験名 |
| description | text |  | 説明 |
| is_active | boolean | not null, default true | 有効フラグ |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

初期データ:

| code | name |
|---|---|
| it_passport | ITパスポート |
| fe | 基本情報技術者 |

## 7. question_categories

問題カテゴリを管理する。  
小分類は作らず、大分類のみでよい。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | カテゴリID |
| code | varchar(50) | unique, not null | technology / management / strategy |
| name | varchar(100) | not null | カテゴリ名 |
| sort_order | integer | not null | 表示順 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

初期データ:

| code | name |
|---|---|
| technology | テクノロジ系 |
| management | マネジメント系 |
| strategy | ストラテジ系 |

## 8. questions

過去問データを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 問題ID |
| exam_id | uuid | FK exams.id, not null | 試験 |
| category_id | uuid | FK question_categories.id, not null | 大分類 |
| source_year | integer |  | 出題年度 |
| source_season | varchar(30) |  | 春期 / 秋期 / 通年など |
| question_no | integer |  | 問題番号 |
| question_text | text | not null | 問題文 |
| explanation | text |  | 解説 |
| question_type | varchar(30) | not null, default single_choice | single_choice |
| difficulty | integer | nullable | 将来用。今回は画面では使わない |
| status | varchar(30) | not null, default published | draft / published / archived |
| created_by | uuid | FK users.id | 登録者 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |
| deleted_at | timestamp |  | 論理削除日時 |

インデックス:

- `idx_questions_exam_id`
- `idx_questions_category_id`
- `idx_questions_status`
- `idx_questions_source`

注意:

- 難易度選択は画面に出さない。
- ただし将来拡張用として `difficulty` をnullableで持つのは可。
- 正解は `question_choices.is_correct` で管理する。

## 9. question_choices

問題の選択肢を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 選択肢ID |
| question_id | uuid | FK questions.id, not null | 問題ID |
| choice_label | varchar(10) | not null | A / B / C / D など |
| choice_text | text | not null | 選択肢本文 |
| is_correct | boolean | not null, default false | 正解フラグ |
| sort_order | integer | not null | 表示順 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

制約:

- `unique(question_id, choice_label)`
- `unique(question_id, sort_order)`

実装注意:

- 1つの問題につき、原則1つだけ `is_correct = true` にする。
- DB制約で完全に1つだけにするのは難しいため、API側でもチェックする。

## 10. 優先度1で必要なseed例

```text
roles:
- student
- teacher
- admin

exams:
- ITパスポート
- 基本情報技術者

question_categories:
- テクノロジ系
- マネジメント系
- ストラテジ系

test users:
- 学生ユーザー1名
- 教師ユーザー1名

questions:
- ITパスポートのサンプル問題を数問
- 基本情報技術者のサンプル問題を数問
```

## 11. Prisma実装メモ

- UUIDはPostgreSQLの `gen_random_uuid()` を使うか、Prismaの `@default(uuid())` を使う。
- `created_at` は `@default(now())`。
- `updated_at` は `@updatedAt`。
- 論理削除が必要なテーブルは `deleted_at` を持つ。
- roleはenumでもよいが、今回は `roles` テーブルを優先する。
