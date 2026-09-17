"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  BoardCommentView,
  BoardPostView,
  BoardThreadView,
} from "@/lib/board/contract";
import { readJsonResponse } from "@/lib/read-json-response";
import { scheduleBoardDialogOpen } from "./dialog-lifecycle";

export function ReplyDialog({
  post,
  viewerName,
  onClose,
  onSent,
}: {
  post: BoardPostView;
  viewerName: string;
  onClose: () => void;
  onSent: (postId: string, comment: BoardCommentView) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [thread, setThread] = useState<BoardThreadView | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    return scheduleBoardDialogOpen(dialog);
  }, [post.id]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadThread() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/board/posts/${post.id}`, {
          signal: controller.signal,
        });
        const data = await readJsonResponse<BoardThreadView & { error?: string }>(
          response,
        );
        if (!response.ok || !data) {
          throw new Error(data?.error ?? "返信を読み込めませんでした。");
        }
        setThread(data);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "返信を読み込めませんでした。",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadThread();
    return () => controller.abort();
  }, [post.id]);

  async function submitReply() {
    const body = draft.trim();
    if (!body || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await readJsonResponse<BoardCommentView & { error?: string }>(
        response,
      );
      if (!response.ok || !data?.id) {
        throw new Error(data?.error ?? "返信できませんでした。");
      }

      setThread((current) =>
        current
          ? { ...current, comments: [...current.comments, data] }
          : current,
      );
      setDraft("");
      onSent(post.id, data);
      dialogRef.current?.close();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "返信できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="board-reply-heading"
      className="m-auto max-h-[90vh] w-[calc(100%_-_28px)] max-w-[620px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          aria-label="返信画面を閉じる"
          onClick={() => dialogRef.current?.close()}
          className="grid size-9 place-items-center rounded-full text-2xl text-slate-600 transition hover:bg-slate-100"
        >
          ×
        </button>
        <h2 id="board-reply-heading" className="font-black text-slate-950">
          返信する
        </h2>
      </header>

      <div className="flex gap-3 px-4 pb-0 pt-4 sm:gap-4 sm:px-6">
        <div className="flex w-10 shrink-0 flex-col items-center sm:w-11">
          <AuthorAvatar post={post} />
          <span className="mt-2 min-h-8 w-0.5 flex-1 bg-slate-300" />
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
          {post.author.titleName ? (
            <span className="mt-1.5 inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-900">
              {post.author.titleName}
            </span>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
            {post.body}
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">
            返信先：
            <Link
              href={`/board/users/${post.author.id}`}
              className="font-bold text-blue-600 hover:underline"
            >
              {post.author.displayName}
            </Link>
            さん
          </p>
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="flex gap-3 sm:gap-4">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700 sm:size-11"
          >
            {viewerName.slice(0, 1)}
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">返信本文</span>
            <textarea
              maxLength={280}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="返信を投稿"
              className="min-h-24 w-full resize-y border-0 bg-transparent px-0 py-2 text-base leading-7 outline-none placeholder:text-slate-400"
              autoFocus
            />
          </label>
        </div>
        <div className="ml-[52px] flex items-center justify-end gap-3 border-t border-slate-200 pt-3 sm:ml-[60px]">
          <span className="text-xs font-bold text-slate-500">
            {draft.length} / 280
          </span>
          <button
            type="button"
            disabled={!draft.trim() || submitting}
            onClick={submitReply}
            className="min-h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? "返信中..." : "返信する"}
          </button>
        </div>
        {error ? (
          <p className="ml-[52px] mt-3 text-sm font-bold text-rose-700 sm:ml-[60px]" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <h3 className="border-y border-slate-200 border-t-8 border-t-[#f5f7fb] px-4 py-3 text-sm font-black sm:px-6">
        返信
      </h3>
      <div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm font-bold text-slate-500">
            返信を読み込んでいます...
          </p>
        ) : thread && thread.comments.length > 0 ? (
          thread.comments.map((comment) => (
            <article
              key={comment.id}
              className="flex gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0 sm:gap-4 sm:px-6"
            >
              <CommentAvatar comment={comment} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/board/users/${comment.author.id}`}
                  className="font-black text-slate-950 hover:underline"
                >
                  {comment.author.displayName}
                </Link>
                {comment.author.titleName ? (
                  <span className="mt-1.5 block w-fit rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-900">
                    {comment.author.titleName}
                  </span>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                  {comment.body}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="px-5 py-8 text-center text-sm font-bold text-slate-500">
            まだ返信はありません。
          </p>
        )}
      </div>
    </dialog>
  );
}

function AuthorAvatar({ post }: { post: BoardPostView }) {
  return (
    <Link
      href={`/board/users/${post.author.id}`}
      aria-label={`${post.author.displayName}さんのプロフィール`}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 bg-cover bg-center text-sm font-black text-blue-700 sm:size-11"
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

function CommentAvatar({ comment }: { comment: BoardCommentView }) {
  return (
    <Link
      href={`/board/users/${comment.author.id}`}
      aria-label={`${comment.author.displayName}さんのプロフィール`}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 bg-cover bg-center text-sm font-black text-blue-700"
      style={
        comment.author.avatarUrl
          ? { backgroundImage: `url(${comment.author.avatarUrl})` }
          : undefined
      }
    >
      {comment.author.avatarUrl ? (
        <span className="sr-only">{comment.author.displayName}</span>
      ) : (
        comment.author.displayName.slice(0, 1)
      )}
    </Link>
  );
}
