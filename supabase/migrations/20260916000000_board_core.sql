create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (
    char_length(body) <= 280
    and char_length(regexp_replace(body, '[[:space:]]', '', 'g')) > 0
  ),
  is_pinned boolean not null default false,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3)
);

create index idx_board_posts_author_id_fk
  on public.board_posts(author_id);
create index idx_board_posts_feed_live
  on public.board_posts(is_pinned desc, created_at desc, id desc)
  where deleted_at is null;
create index idx_board_posts_author_live
  on public.board_posts(author_id, created_at desc, id desc)
  where deleted_at is null;

create table public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete restrict,
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (
    char_length(body) <= 280
    and char_length(regexp_replace(body, '[[:space:]]', '', 'g')) > 0
  ),
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3)
);

create index idx_board_comments_post_id_fk
  on public.board_comments(post_id);
create index idx_board_comments_author_id_fk
  on public.board_comments(author_id);
create index idx_board_comments_thread_live
  on public.board_comments(post_id, created_at, id)
  where deleted_at is null;

create table public.board_post_likes (
  post_id uuid not null references public.board_posts(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz(3) not null default now(),
  primary key (post_id, user_id)
);

create index idx_board_post_likes_user_id
  on public.board_post_likes(user_id);

create table public.board_delete_logs (
  id uuid primary key default gen_random_uuid(),
  target_type varchar(20) not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  deleted_by uuid not null references public.users(id) on delete restrict,
  reason text,
  deleted_at timestamptz(3) not null default now()
);

create index idx_board_delete_logs_actor_time
  on public.board_delete_logs(deleted_by, deleted_at desc);
create index idx_board_delete_logs_target
  on public.board_delete_logs(target_type, target_id);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_post_likes enable row level security;
alter table public.board_delete_logs enable row level security;
