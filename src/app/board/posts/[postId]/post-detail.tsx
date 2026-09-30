"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  BoardCommentView,
  BoardPostView,
  BoardThreadView,
} from "@/lib/board/contract";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  BoardAuthorName,
  PostCard,
  TeacherBadge,
} from "../../post-card";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function PostDetail({
  initialThread,
  viewerName,
}: {
  initialThread: BoardThreadView;
  viewerName: string;
}) {
  const [post, setPost] = useState(initialThread.post);
  const [comments, setComments] = useState(initialThread.comments);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

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
      const data = await readJsonResponse<BoardCommentView & { error?: string }>(response);
      if (!response.ok || !data?.id) {
        throw new Error(data?.error ?? "返信できませんでした。");
      }

      setComments((current) => [...current, data]);
      setPost((current) => ({ ...current, commentCount: current.commentCount + 1 }));
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "返信できませんでした。");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(current: BoardPostView) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${current.id}/likes`, {
        method: current.likedByMe ? "DELETE" : "PUT",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "いいねを更新できませんでした。");
      }
      setPost((value) => ({
        ...value,
        likedByMe: !current.likedByMe,
        likeCount: Math.max(0, value.likeCount + (current.likedByMe ? -1 : 1)),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "いいねを更新できませんでした。");
    } finally {
      setPending(false);
    }
  }

  async function togglePin(current: BoardPostView) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${current.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !current.isPinned }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "固定状態を変更できませんでした。");
      }
      setPost((value) => ({ ...value, isPinned: !current.isPinned }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "固定状態を変更できませんでした。");
    } finally {
      setPending(false);
    }
  }

  async function deletePost(current: BoardPostView) {
    if (pending || !window.confirm("この投稿を削除しますか？")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${current.id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "投稿を削除できませんでした。");
      }
      window.location.assign("/board");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "投稿を削除できませんでした。");
      setPending(false);
    }
  }

  async function deleteComment(comment: BoardCommentView) {
    if (pending || !window.confirm("この返信を削除しますか？")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/board/comments/${comment.id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "返信を削除できませんでした。");
      }
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setPost((current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "返信を削除できませんでした。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <p className="mb-2 text-sm font-black tracking-[0.14em] text-blue-600">COMMUNITY</p>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex h-16 items-center gap-4 border-b border-slate-200 px-4 sm:px-6">
          <Link href="/board" aria-label="掲示板へ戻る" className="grid size-9 place-items-center rounded-full text-2xl text-slate-700 hover:bg-slate-100">
            ←
          </Link>
          <h1 className="font-black text-slate-950">投稿</h1>
        </header>

        <PostCard
          post={post}
          pending={pending}
          onReply={() => replyRef.current?.focus()}
          onLike={toggleLike}
          onPin={togglePin}
          onDelete={deletePost}
        />

        <h2 className="border-b border-slate-200 px-4 py-4 text-sm font-black text-slate-950 sm:px-6">
          コメント <span className="text-slate-500">{comments.length}件</span>
        </h2>
        {comments.map((comment) => (
          <article key={comment.id} className="flex gap-3 border-b border-slate-200 px-4 py-5 sm:gap-4 sm:px-6">
            <Link
              href={`/board/users/${comment.author.id}`}
              aria-label={`${comment.author.displayName}さんのプロフィール`}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 bg-cover bg-center text-sm font-black text-blue-700"
              style={comment.author.avatarUrl ? { backgroundImage: `url(${comment.author.avatarUrl})` } : undefined}
            >
              {comment.author.avatarUrl ? <span className="sr-only">{comment.author.displayName}</span> : comment.author.displayName.slice(0, 1)}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BoardAuthorName author={comment.author} />
                <TeacherBadge isTeacher={comment.author.isTeacher} />
                <time dateTime={comment.createdAt} className="text-xs text-slate-400">· {dateFormatter.format(new Date(comment.createdAt))}</time>
              </div>
              {comment.author.titleName ? <span className="mt-1.5 inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-900">{comment.author.titleName}</span> : null}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">{comment.body}</p>
              {comment.canDelete ? (
                <button type="button" disabled={pending} onClick={() => deleteComment(comment)} className="mt-3 text-xs font-bold text-slate-500 hover:text-rose-700 disabled:opacity-50">削除</button>
              ) : null}
            </div>
          </article>
        ))}

        <div className="flex gap-3 px-4 py-5 sm:gap-4 sm:px-6">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700">{viewerName.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <p className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <span>返信先：</span>
              <BoardAuthorName author={post.author} />
              {post.author.isTeacher ? null : <span>さん</span>}
            </p>
            <label htmlFor="board-detail-reply" className="sr-only">返信本文</label>
            <textarea
              ref={replyRef}
              id="board-detail-reply"
              maxLength={280}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="返信を投稿"
              className="min-h-24 w-full resize-y border-0 bg-transparent px-0 py-2 leading-7 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
              <span className="text-xs font-bold text-slate-500">{draft.length} / 280</span>
              <button type="button" disabled={!draft.trim() || submitting} onClick={submitReply} className="min-h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300">
                {submitting ? "返信中..." : "返信する"}
              </button>
            </div>
          </div>
        </div>
        {error ? <p role="alert" className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
      </section>
    </div>
  );
}
