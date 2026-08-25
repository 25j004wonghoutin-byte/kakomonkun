# DBテーブル設計 改訂版 優先度3：掲示板・お知らせ・通知・管理系

## 1. 方針

優先度3では、学習以外の補助機能を実装する。

対象:

```text
board_posts
board_comments
announcements
notifications
user_notifications
audit_logs
point_rule_configs
```

重要:

- 掲示板はリアルタイムチャットではない。
- 投稿とコメントの形式にする。
- お知らせと通知は別扱い。
- 管理者や教師の操作ログを残せるようにする。

## 2. board_posts

掲示板の投稿を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 投稿ID |
| author_id | uuid | FK users.id, not null | 投稿者 |
| title | varchar(200) | not null | 投稿タイトル |
| body | text | not null | 投稿本文 |
| category | varchar(50) | nullable | question / notice / other など |
| status | varchar(30) | not null, default published | published / hidden / deleted |
| comment_count | integer | not null, default 0 | コメント数 |
| last_commented_at | timestamp |  | 最終コメント日時 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |
| deleted_at | timestamp |  | 論理削除日時 |

インデックス:

- `idx_board_posts_author_id`
- `idx_board_posts_status`
- `idx_board_posts_created_at`
- `idx_board_posts_last_commented_at`

## 3. board_comments

掲示板投稿へのコメントを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | コメントID |
| post_id | uuid | FK board_posts.id, not null | 投稿ID |
| author_id | uuid | FK users.id, not null | 投稿者 |
| body | text | not null | コメント本文 |
| status | varchar(30) | not null, default published | published / hidden / deleted |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |
| deleted_at | timestamp |  | 論理削除日時 |

インデックス:

- `idx_board_comments_post_id`
- `idx_board_comments_author_id`
- `idx_board_comments_created_at`

実装注意:

- コメント作成時に `board_posts.comment_count` を更新する。
- コメント作成時に `board_posts.last_commented_at` を更新する。

## 4. announcements

全体向けのお知らせを管理する。  
ホーム画面には直接大きく出さず、通知ベルやお知らせ一覧で扱う。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | お知らせID |
| title | varchar(200) | not null | タイトル |
| body | text | not null | 本文 |
| status | varchar(30) | not null, default draft | draft / published / archived |
| published_at | timestamp |  | 公開日時 |
| created_by | uuid | FK users.id | 作成者 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

インデックス:

- `idx_announcements_status`
- `idx_announcements_published_at`

## 5. notifications

通知本体を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | 通知ID |
| type | varchar(50) | not null | announcement / point / ranking / system |
| title | varchar(200) | not null | 通知タイトル |
| body | text |  | 通知本文 |
| source_type | varchar(50) |  | announcement / board_post / ranking など |
| source_id | uuid |  | 関連ID |
| created_at | timestamp | not null | 作成日時 |

## 6. user_notifications

ユーザーごとの通知状態を管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ID |
| notification_id | uuid | FK notifications.id, not null | 通知 |
| user_id | uuid | FK users.id, not null | ユーザー |
| read_at | timestamp |  | 既読日時 |
| created_at | timestamp | not null | 作成日時 |

制約:

- `unique(notification_id, user_id)`

## 7. audit_logs

管理系操作のログを管理する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ログID |
| actor_id | uuid | FK users.id | 操作者 |
| action | varchar(100) | not null | 操作名 |
| target_type | varchar(100) |  | 対象テーブルなど |
| target_id | uuid |  | 対象ID |
| metadata | jsonb |  | 補足情報 |
| created_at | timestamp | not null | 作成日時 |

利用例:

- 問題登録
- 模擬試験公開
- ユーザー停止
- 投稿非表示
- ランキング集計

## 8. point_rule_configs

ポイント付与ルールを将来変更しやすくするための設定テーブル。  
初期実装では必須ではないが、将来のルール追加を考えるなら作成する。

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | ルールID |
| reason | varchar(50) | unique, not null | point_transactions.reasonと対応 |
| points | integer | not null | 付与ポイント |
| daily_limit | integer | nullable | 1日あたり上限 |
| monthly_limit | integer | nullable | 1か月あたり上限 |
| is_active | boolean | not null, default true | 有効フラグ |
| description | text |  | 説明 |
| created_at | timestamp | not null | 作成日時 |
| updated_at | timestamp | not null | 更新日時 |

初期データ例:

| reason | points | daily_limit | monthly_limit |
|---|---:|---:|---:|
| daily_qa_answer | 1 | 1 | null |
| daily_qa_correct | 1 | 1 | null |
| practice_complete | 5 | 2 | null |
| practice_correct_bonus | 1 | null | null |
| mock_exam_taken | 20 | null | 1 |
| monthly_ranking_reward | 0 | null | 1 |

## 9. 優先度3のAPI実装例

掲示板:

```text
GET    /api/board/posts
POST   /api/board/posts
GET    /api/board/posts/[id]
POST   /api/board/posts/[id]/comments
PATCH  /api/board/posts/[id]
DELETE /api/board/posts/[id]
```

通知:

```text
GET   /api/notifications
PATCH /api/notifications/[id]/read
```

お知らせ:

```text
GET    /api/announcements
POST   /api/admin/announcements
PATCH  /api/admin/announcements/[id]
```

管理:

```text
GET   /api/admin/users
PATCH /api/admin/users/[id]
GET   /api/admin/audit-logs
```
