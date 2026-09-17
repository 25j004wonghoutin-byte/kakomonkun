"use client";

import Link from "next/link";
import type { BoardPostView } from "@/lib/board/contract";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function PostCard({
  post,
  pending,
  onReply,
  onLike,
  onPin,
  onDelete,
}: {
  post: BoardPostView;
  pending: boolean;
  onReply: (post: BoardPostView) => void;
  onLike: (post: BoardPostView) => void;
  onPin: (post: BoardPostView) => void;
  onDelete: (post: BoardPostView) => void;
}) {
  const authorLabel = post.author.isTeacher
    ? post.author.displayName
    : `${post.author.displayName}さん`;

  return (
    <article className="border-b border-slate-200 px-4 py-5 last:border-b-0 sm:px-6 sm:py-6 [content-visibility:auto]">
      {post.isPinned ? (
        <p className="mb-3 ml-12 flex items-center gap-2 text-xs font-bold text-slate-500 sm:ml-[60px]">
          <PinIcon className="size-3.5" />
          先生からのお知らせ
        </p>
      ) : null}

      <div className="flex gap-3 sm:gap-4">
        <AuthorAvatar post={post} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-5">
            <Link
              href={`/board/users/${post.author.id}`}
              className="font-black text-slate-950 hover:underline"
            >
              {post.author.displayName}
            </Link>
            {post.author.isTeacher ? (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                先生
              </span>
            ) : null}
            <time
              dateTime={post.createdAt}
              className="text-xs font-medium text-slate-400"
            >
              · {dateFormatter.format(new Date(post.createdAt))}
            </time>
          </div>

          {post.author.titleName ? (
            <span className="mt-1.5 inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-900">
              {post.author.titleName}
            </span>
          ) : null}

          <Link
            href={`/board/posts/${post.id}`}
            className="mt-3 block rounded text-slate-800 outline-offset-4 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[15px]">
              {post.body}
            </p>
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 text-xs font-bold text-slate-500 sm:gap-x-10">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => onReply(post)}
                className="transition hover:text-blue-600 disabled:opacity-50"
                aria-label={`${authorLabel}の投稿に返信`}
              >
                <ReplyIcon className="size-5" />
              </button>
              <Link
                href={`/board/posts/${post.id}`}
                aria-label={`返信${post.commentCount}件を見る`}
                className="hover:text-blue-600"
              >
                {post.commentCount}
              </Link>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => onLike(post)}
              aria-pressed={post.likedByMe}
              className={`flex items-center gap-1.5 transition disabled:opacity-50 ${
                post.likedByMe
                  ? "text-rose-600"
                  : "hover:text-rose-600"
              }`}
              aria-label={`${authorLabel}の投稿にいいね`}
            >
              <HeartIcon className="size-5" filled={post.likedByMe} />
              {post.likeCount}
            </button>
            {post.canPin ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onPin(post)}
                className="transition hover:text-blue-700 disabled:opacity-50"
              >
                {post.isPinned ? "固定を解除" : "固定"}
              </button>
            ) : null}
            {post.canDelete ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onDelete(post)}
                className="transition hover:text-rose-700 disabled:opacity-50"
              >
                削除
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function AuthorAvatar({ post }: { post: BoardPostView }) {
  const className =
    "grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 bg-cover bg-center text-sm font-black text-blue-700 transition hover:brightness-95 sm:size-11";

  return (
    <Link
      href={`/board/users/${post.author.id}`}
      aria-label={`${post.author.displayName}${post.author.isTeacher ? "" : "さん"}のプロフィール`}
      className={className}
      style={
        post.author.avatarUrl
          ? { backgroundImage: `url(${post.author.avatarUrl})` }
          : undefined
      }
    >
      {post.author.avatarUrl ? (
        <span className="sr-only">{post.author.displayName}</span>
      ) : (
        post.author.displayName.slice(0, 1)
      )}
    </Link>
  );
}

function ReplyIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M4 5h16v11H8l-4 4V5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({
  className,
  filled,
}: {
  className: string;
  filled: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
    >
      <path
        d="M20.5 5.5C17 2 13 5 12 7c-1-2-5-5-8.5-1.5S3 14 12 21c9-7 12-12 8.5-15.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M8 3h8l-1 7 4 4H5l4-4-1-7Zm4 11v7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
