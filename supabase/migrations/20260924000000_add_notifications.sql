create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete restrict,
  actor_id uuid references public.users(id) on delete restrict,
  type varchar(30) not null check (
    type in ('board_reply', 'board_pinned', 'title_unlocked')
  ),
  board_post_id uuid references public.board_posts(id) on delete restrict,
  board_comment_id uuid references public.board_comments(id) on delete restrict,
  title_id uuid references public.titles(id) on delete restrict,
  read_at timestamptz(3),
  created_at timestamptz(3) not null default now(),
  constraint notifications_target_check check (
    (
      type = 'board_reply'
      and actor_id is not null
      and board_comment_id is not null
      and board_post_id is null
      and title_id is null
    )
    or (
      type = 'board_pinned'
      and actor_id is not null
      and board_post_id is not null
      and board_comment_id is null
      and title_id is null
    )
    or (
      type = 'title_unlocked'
      and actor_id is null
      and title_id is not null
      and board_post_id is null
      and board_comment_id is null
    )
  ),
  constraint notifications_recipient_type_comment_key
    unique (recipient_id, type, board_comment_id),
  constraint notifications_recipient_type_post_key
    unique (recipient_id, type, board_post_id),
  constraint notifications_recipient_type_title_key
    unique (recipient_id, type, title_id)
);

create index idx_notifications_recipient_id
  on public.notifications(recipient_id);
create index idx_notifications_actor_id
  on public.notifications(actor_id);
create index idx_notifications_board_post_id
  on public.notifications(board_post_id);
create index idx_notifications_board_comment_id
  on public.notifications(board_comment_id);
create index idx_notifications_title_id
  on public.notifications(title_id);
create index idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc, id desc);
create index idx_notifications_recipient_unread
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
