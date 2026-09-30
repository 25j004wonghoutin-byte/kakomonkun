"use client";

import Link from "next/link";
import { useState } from "react";
import type { BoardPostView, BoardPublicProfileView } from "@/lib/board/contract";
import { readJsonResponse } from "@/lib/read-json-response";
import { PostCard, TeacherBadge } from "../../post-card";
import { ReplyDialog } from "../../reply-dialog";

export function PublicProfile({
  initialProfile,
  viewerName,
}: {
  initialProfile: BoardPublicProfileView;
  viewerName: string;
}) {
  const [posts, setPosts] = useState(initialProfile.posts);
  const [postCount, setPostCount] = useState(initialProfile.postCount);
  const [nextCursor, setNextCursor] = useState(initialProfile.nextCursor);
  const [replyPost, setReplyPost] = useState<BoardPostView | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function markPending(postId: string, pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const search = new URLSearchParams({ cursor: nextCursor });
      const response = await fetch(`/api/board/users/${initialProfile.id}?${search}`);
      const data = await readJsonResponse<BoardPublicProfileView & { error?: string }>(response);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? "投稿を読み込めませんでした。");
      }
      setPosts((current) => [...current, ...data.posts]);
      setNextCursor(data.nextCursor);
      setPostCount(data.postCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "投稿を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function toggleLike(post: BoardPostView) {
    if (pendingIds.has(post.id)) return;
    markPending(post.id, true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${post.id}/likes`, {
        method: post.likedByMe ? "DELETE" : "PUT",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "いいねを更新できませんでした。");
      }
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        likedByMe: !post.likedByMe,
        likeCount: Math.max(0, item.likeCount + (post.likedByMe ? -1 : 1)),
      } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "いいねを更新できませんでした。");
    } finally {
      markPending(post.id, false);
    }
  }

  async function togglePin(post: BoardPostView) {
    if (pendingIds.has(post.id)) return;
    markPending(post.id, true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${post.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !post.isPinned }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "固定状態を変更できませんでした。");
      }
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        isPinned: !post.isPinned,
      } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "固定状態を変更できませんでした。");
    } finally {
      markPending(post.id, false);
    }
  }

  async function deletePost(post: BoardPostView) {
    if (pendingIds.has(post.id) || !window.confirm("この投稿を削除しますか？")) return;
    markPending(post.id, true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${post.id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "投稿を削除できませんでした。");
      }
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setPostCount((current) => Math.max(0, current - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "投稿を削除できませんでした。");
    } finally {
      markPending(post.id, false);
    }
  }

  function handleReplySent(postId: string) {
    setPosts((current) => current.map((post) => post.id === postId ? {
      ...post,
      commentCount: post.commentCount + 1,
    } : post));
  }

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <p className="mb-2 text-sm font-black tracking-[0.14em] text-blue-600">COMMUNITY</p>
      <h1 className="mb-5 text-3xl font-black text-slate-950 sm:text-4xl">プロフィール</h1>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex min-h-16 items-center gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
          <Link href="/board" aria-label="掲示板へ戻る" className="grid size-9 place-items-center rounded-full text-2xl text-slate-700 hover:bg-slate-100">←</Link>
          <div>
            <h2 className={`font-black ${initialProfile.isTeacher ? "text-violet-800" : "text-slate-950"}`}>{initialProfile.displayName}</h2>
            <p className="text-xs text-slate-500">{postCount}件の投稿</p>
          </div>
        </header>

        <div className="h-32 bg-blue-100" aria-hidden="true" />
        <div className="px-4 pb-6 sm:px-6">
          <div
            aria-hidden="true"
            className="-mt-11 grid size-20 place-items-center rounded-full border-4 border-white bg-blue-100 bg-cover bg-center text-2xl font-black text-blue-700"
            style={initialProfile.avatarUrl ? { backgroundImage: `url(${initialProfile.avatarUrl})` } : undefined}
          >
            {initialProfile.avatarUrl ? null : initialProfile.displayName.slice(0, 1)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h3 className={`text-xl font-black ${initialProfile.isTeacher ? "text-violet-800" : "text-slate-950"}`}>{initialProfile.displayName}</h3>
            <TeacherBadge isTeacher={initialProfile.isTeacher} />
          </div>
          {initialProfile.titleName ? <span className="mt-2 inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-900">{initialProfile.titleName}</span> : null}
          {initialProfile.bio ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{initialProfile.bio}</p> : null}
        </div>

        <h3 className="border-y border-slate-200 px-4 py-4 text-sm font-black text-blue-700 sm:px-6">投稿</h3>
        {error ? <p role="alert" className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
        {posts.length > 0 ? posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            pending={pendingIds.has(post.id)}
            onReply={setReplyPost}
            onLike={toggleLike}
            onPin={togglePin}
            onDelete={deletePost}
          />
        )) : <p className="px-5 py-14 text-center text-sm font-bold text-slate-500">まだ投稿はありません。</p>}

        {nextCursor ? <div className="border-t border-slate-200 px-5 py-4 text-center">
          <button type="button" disabled={loading} onClick={loadMore} className="min-h-10 rounded-lg border border-slate-300 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? "読み込み中..." : "さらに読み込む"}
          </button>
        </div> : null}
      </section>

      {replyPost ? <ReplyDialog
        post={replyPost}
        viewerName={viewerName}
        onClose={() => setReplyPost(null)}
        onSent={handleReplySent}
      /> : null}
    </div>
  );
}
