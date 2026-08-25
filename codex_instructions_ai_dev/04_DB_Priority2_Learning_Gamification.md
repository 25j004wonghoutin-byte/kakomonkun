# DBテーブル設計 改訂版 優先度2：学習履歴・模擬試験・ポイント・称号・ランキング

## 1. 方針

優先度2では、学習機能の履歴保存とゲーミフィケーションを実装する。

対象:

```text
daily_qa_answers
practice_sessions
practice_answers
mock_exams
mock_exam_questions
mock_attempts
mock_answers
point_transactions
titles
user_titles
monthly_rankings
```

重要:

- 一問一答と過去問練習は別機能。
- ポイントは必ず履歴テーブル `point_transactions` に保存する。
- 月別ランキングは `monthly_rankings` に保存する。
- 模擬試験は月1回受験を基本とする。

## 2. daily_qa_answers

ホーム画面の一問一答の回答履歴を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 回答ID |
| user_id | uuid | FK users.id, not null | 学生 |
| question_id | uuid | FK questions.id, not null | 問題 |
| selected_choice_id | uuid | FK question_choices.id | 選択肢 |
| is_correct | boolean | not null | 正誤 |
| answer_date | date | not null | 回答日 |
| answered_at | timestamp | not null | 回答日時 |
| answer_point_awarded | boolean | not null, default false | 回答ポイント付与済み |
| correct_point_awarded | boolean | not null, default false | 正解ポイント付与済み |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(user_id, answer_date)`  
  1日1回の一問一答回答を前提とする。

ポイント:

- 日に初回回答で1pt。
- 日に初回正解で追加1pt。

## 3. practice_sessions

過去問練習の1回分のセッションを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | セッションID |
| user_id | uuid | FK users.id, not null | 学生 |
| exam_id | uuid | FK exams.id, not null | 試験 |
| status | varchar(30) | not null, default in_progress | in_progress / completed / abandoned |
| question_count | integer | not null, default 0 | 出題数 |
| answered_count | integer | not null, default 0 | 回答数 |
| correct_count | integer | not null, default 0 | 正解数 |
| earned_points | integer | not null, default 0 | このセッションで獲得したポイント |
| started_at | timestamp | not null | 開始日時 |
| completed_at | timestamp |  | 完了日時 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

インデックス:

- `idx_practice_sessions_user_id`
- `idx_practice_sessions_exam_id`
- `idx_practice_sessions_started_at`
- `idx_practice_sessions_status`

## 4. practice_answers

過去問練習中の回答履歴を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 回答ID |
| session_id | uuid | FK practice_sessions.id, not null | セッション |
| question_id | uuid | FK questions.id, not null | 問題 |
| selected_choice_id | uuid | FK question_choices.id | 選択肢 |
| is_correct | boolean | not null | 正誤 |
| order_no | integer | not null | セッション内の出題順 |
| answered_at | timestamp | not null | 回答日時 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(session_id, question_id)`
- `unique(session_id, order_no)`

## 5. mock_exams

月別模擬試験を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 模擬試験ID |
| exam_id | uuid | FK exams.id, not null | 対象試験 |
| title | varchar(200) | not null | 模擬試験名 |
| target_month | date | not null | 対象月。月初日で保存 |
| description | text |  | 説明 |
| time_limit_minutes | integer |  | 制限時間 |
| question_count | integer | not null, default 0 | 問題数 |
| status | varchar(30) | not null, default draft | draft / published / closed |
| available_from | timestamp |  | 受験開始日時 |
| available_until | timestamp |  | 受験終了日時 |
| created_by | uuid | FK users.id | 作成者 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

制約:

- `unique(exam_id, target_month)`

## 6. mock_exam_questions

模擬試験に含める問題を管理する中間テーブル。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ID |
| mock_exam_id | uuid | FK mock_exams.id, not null | 模擬試験 |
| question_id | uuid | FK questions.id, not null | 問題 |
| order_no | integer | not null | 出題順 |
| score | integer | not null, default 1 | 配点 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(mock_exam_id, question_id)`
- `unique(mock_exam_id, order_no)`

## 7. mock_attempts

学生の模擬試験受験履歴を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 受験ID |
| mock_exam_id | uuid | FK mock_exams.id, not null | 模擬試験 |
| user_id | uuid | FK users.id, not null | 学生 |
| status | varchar(30) | not null, default in_progress | in_progress / submitted / expired |
| started_at | timestamp | not null | 開始日時 |
| submitted_at | timestamp |  | 提出日時 |
| total_questions | integer | not null, default 0 | 問題数 |
| correct_count | integer | not null, default 0 | 正解数 |
| score | integer | not null, default 0 | 得点 |
| earned_points | integer | not null, default 0 | 受験ポイント |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

制約:

- `unique(mock_exam_id, user_id)`  
  同じ月の模擬試験は1人1回を基本とする。

## 8. mock_answers

模擬試験の回答を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 回答ID |
| attempt_id | uuid | FK mock_attempts.id, not null | 受験ID |
| question_id | uuid | FK questions.id, not null | 問題 |
| selected_choice_id | uuid | FK question_choices.id | 選択肢 |
| is_correct | boolean | not null | 正誤 |
| score_awarded | integer | not null, default 0 | 獲得点 |
| answered_at | timestamp |  | 回答日時 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(attempt_id, question_id)`

## 9. point_transactions

ポイントの増減履歴を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ポイント履歴ID |
| user_id | uuid | FK users.id, not null | 対象ユーザー |
| points | integer | not null | 加算または減算ポイント |
| reason | varchar(50) | not null | 付与理由 |
| source_type | varchar(50) |  | daily_qa / practice / mock_exam / ranking / title_purchase |
| source_id | uuid |  | 関連ID |
| transaction_date | date | not null | 集計用日付 |
| description | text |  | 説明 |
| created_at | timestamp | not null | 作成日時 |

reason候補:

| reason | 説明 |
|---|---|
| daily_qa_answer | 一問一答に回答 |
| daily_qa_correct | 一問一答に正解 |
| practice_complete | 過去問練習完了 |
| practice_correct_bonus | 過去問練習10問正解ごと |
| mock_exam_taken | 模擬試験受験 |
| monthly_ranking_reward | 月間ランキング報酬 |
| title_purchase | 称号購入 |

ポイントルール:

| reason | ポイント |
|---|---:|
| daily_qa_answer | +1 |
| daily_qa_correct | +1 |
| practice_complete | +5 |
| practice_correct_bonus | +1 |
| mock_exam_taken | +20 |
| monthly_ranking_reward | +150 / +100 / +75 |
| title_purchase | マイナス |

実装注意:

- ポイント加算後、`student_profiles.total_points` を更新する。
- 二重付与を避けるため、API側で日付や月の条件をチェックする。
- 可能なら `source_type + source_id + reason + user_id` の組み合わせで二重登録を防ぐ。

## 10. titles

称号ショップで交換できる称号を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 称号ID |
| name | varchar(100) | unique, not null | 称号名 |
| description | text |  | 説明 |
| price_points | integer | not null | 必要ポイント |
| rarity | varchar(30) | not null, default normal | normal / rare / epic |
| is_active | boolean | not null, default true | 表示可否 |
| sort_order | integer | not null, default 0 | 表示順 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

seed例:

| name | price_points |
|---|---:|
| はじめの一歩 | 50 |
| 努力家 | 100 |
| テクノロジーマスター | 300 |
| 模擬試験チャレンジャー | 500 |

## 11. user_titles

ユーザーが所持している称号を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ID |
| user_id | uuid | FK users.id, not null | ユーザー |
| title_id | uuid | FK titles.id, not null | 称号 |
| purchased_at | timestamp | not null | 交換日時 |
| equipped_at | timestamp |  | 装備日時 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(user_id, title_id)`

注意:

- 現在装備中の称号は `student_profiles.current_title_id` に保存する。
- `equipped_at` は履歴確認用。

## 12. monthly_rankings

月別ランキング結果を保存する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ランキングID |
| target_month | date | not null | 対象月。月初日で保存 |
| user_id | uuid | FK users.id, not null | 学生 |
| rank_no | integer | not null | 順位 |
| monthly_points | integer | not null, default 0 | 月間獲得ポイント |
| mock_score | integer | nullable | 模擬試験得点 |
| reward_points | integer | not null, default 0 | ランキング報酬 |
| calculated_at | timestamp | not null | 集計日時 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(target_month, user_id)`
- `unique(target_month, rank_no)`

集計方針:

- 基本は月間獲得ポイントをもとにランキングする。
- 同点時は模擬試験得点、正答率、早い提出日時などを追加基準にできる。
- 上位3名にはポイント報酬を付与する。
- 報酬付与時は `point_transactions` に `monthly_ranking_reward` を作る。

## 13. 学習状況表示で使う主な集計

プロフィール・学習状況詳細で表示する想定項目:

- 練習回数
- 総回答数
- 総正解数
- 正答率
- 模擬試験受験履歴
- 月間獲得ポイント
- 所持称号
- 現在の称号
