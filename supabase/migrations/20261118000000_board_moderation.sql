create table public.board_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete restrict,
  reason varchar(30) not null check (reason in ('harassment', 'personal_information', 'spam', 'other')),
  created_at timestamptz(3) not null default now(),
  resolved_at timestamptz(3)
);

-- A report has no reporter identifier. Only one pending case is stored per post.
create unique index board_reports_pending_post_key on public.board_reports(post_id)
  where resolved_at is null;
create index idx_board_reports_post_id on public.board_reports(post_id);
create index idx_board_reports_queue on public.board_reports(created_at desc, id desc);

create table public.board_restrictions (
  user_id uuid primary key references public.users(id) on delete cascade,
  expires_at timestamptz(3) not null
);

alter table public.board_reports enable row level security;
alter table public.board_restrictions enable row level security;

alter table public.notifications
  add column board_report_id uuid references public.board_reports(id) on delete restrict,
  drop constraint notifications_type_check,
  drop constraint notifications_target_check,
  add constraint notifications_type_check check (
    type in ('board_reply', 'board_pinned', 'title_unlocked', 'mock_exam_reminder', 'board_report')
  ),
  add constraint notifications_target_check check (
    (type = 'board_reply' and actor_id is not null and board_comment_id is not null and board_post_id is null and title_id is null and target_month is null and board_report_id is null)
    or (type = 'board_pinned' and actor_id is not null and board_post_id is not null and board_comment_id is null and title_id is null and target_month is null and board_report_id is null)
    or (type = 'title_unlocked' and actor_id is null and title_id is not null and board_post_id is null and board_comment_id is null and target_month is null and board_report_id is null)
    or (type = 'mock_exam_reminder' and actor_id is null and title_id is null and board_post_id is null and board_comment_id is null and target_month is not null and extract(day from target_month) = 1 and board_report_id is null)
    or (type = 'board_report' and actor_id is null and title_id is null and board_post_id is null and board_comment_id is null and target_month is null and board_report_id is not null)
  ),
  add constraint notifications_recipient_type_report_key unique (recipient_id, type, board_report_id);

create index idx_notifications_board_report_id on public.notifications(board_report_id);
