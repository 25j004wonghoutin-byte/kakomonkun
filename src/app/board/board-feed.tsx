"use client";

import { useCallback, useRef, useState } from "react";
import { PageHeading } from "@/components/ui";
import type {
  BoardActor,
  BoardPostView,
  BoardScope,
} from "@/lib/board/contract";
import { readJsonResponse } from "@/lib/read-json-response";
import { PostCard } from "./post-card";
import { ReplyDialog } from "./reply-dialog";

type BoardViewer = BoardActor & { displayName: string };

type BoardListResponse = {
  posts: BoardPostView[];
  nextCursor: string | null;
  error?: string;
};

type CreatedPostResponse = {
  id?: string;
  isPinned?: boolean;
  error?: string;
};

export function BoardFeed({
  initialPosts,
  initialNextCursor,
  viewer,
}: {
  initialPosts: BoardPostView[];
  initialNextCursor: string | null;
  viewer: BoardViewer;
}) {
  const [scope, setScope] = useState<BoardScope>("all");
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [draft, setDraft] = useState("");
  const [replyPost, setReplyPost] = useState<BoardPostView | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const closeReply = useCallback(() => setReplyPost(null), []);


  function markPending(postId: string, pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(postId);
      } else {
        next.delete(postId);
      }
      return next;
    });
  }

  async function loadPosts(
    requestedScope: BoardScope,
    cursor: string | null,
    append: boolean,
  ) {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");

    try {
      const search = new URLSearchParams({ scope: requestedScope });
      if (cursor) {
        search.set("cursor", cursor);
      }

      const response = await fetch(`/api/board/posts?${search.toString()}`);
      const data = await readJsonResponse<BoardListResponse>(response);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? "投稿を読み込めませんでした。");
      }
      if (sequence !== requestSequence.current) {
        return;
      }

      setPosts((current) => (append ? [...current, ...data.posts] : data.posts));
      setNextCursor(data.nextCursor);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "投稿を読み込めませんでした。",
        );
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }

  async function changeScope(nextScope: BoardScope) {
    if (nextScope === scope || loading) {
      return;
    }

    setScope(nextScope);
    await loadPosts(nextScope, null, false);
  }

  async function submitPost() {
    const body = draft.trim();
    if (!body || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/board/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await readJsonResponse<CreatedPostResponse>(response);
      if (!response.ok || !data?.id) {
        throw new Error(data?.error ?? "投稿できませんでした。");
      }

      setDraft("");
      await loadPosts(scope, null, false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "投稿できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(post: BoardPostView) {
    if (pendingIds.has(post.id)) {
      return;
    }

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

      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                likedByMe: !post.likedByMe,
                likeCount: Math.max(
                  0,
                  item.likeCount + (post.likedByMe ? -1 : 1),
                ),
              }
            : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "いいねを更新できませんでした。",
      );
    } finally {
      markPending(post.id, false);
    }
  }

  async function togglePin(post: BoardPostView) {
    if (pendingIds.has(post.id)) {
      return;
    }

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

      await loadPosts(scope, null, false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "固定状態を変更できませんでした。",
      );
    } finally {
      markPending(post.id, false);
    }
  }

  async function deletePost(post: BoardPostView) {
    if (
      pendingIds.has(post.id) ||
      !window.confirm("この投稿を削除しますか？")
    ) {
      return;
    }

    markPending(post.id, true);
    setError("");
    try {
      const response = await fetch(`/api/board/posts/${post.id}`, {
        method: "DELETE",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error ?? "投稿を削除できませんでした。");
      }

      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "投稿を削除できませんでした。",
      );
    } finally {
      markPending(post.id, false);
    }
  }

  function handleReplySent(postId: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, commentCount: post.commentCount + 1 }
          : post,
      ),
    );
  }

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <PageHeading
        eyebrow="COMMUNITY"
        title="掲示板"
        description="わからないを、みんなで解決。学習の気づきや頑張りを共有しよう。"
      />

      <section
        aria-label="投稿タイムライン"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div
          role="tablist"
          aria-label="投稿の絞り込み"
          className="flex border-b border-slate-200"
        >
          {(["all", "mine"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              disabled={loading}
              onClick={() => changeScope(value)}
              className={`relative h-14 flex-1 text-sm font-black transition disabled:cursor-wait ${
                scope === value
                  ? "text-blue-600 after:absolute after:bottom-0 after:left-1/4 after:right-1/4 after:h-[3px] after:rounded-full after:bg-blue-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {value === "all" ? "すべて" : "自分の投稿"}
            </button>
          ))}
        </div>

        <div className="flex gap-3 border-b-8 border-[#f5f7fb] px-4 py-5 sm:gap-4 sm:px-6">
          <ViewerAvatar name={viewer.displayName} />
          <div className="min-w-0 flex-1">
            <label htmlFor="board-post-draft" className="sr-only">
              投稿本文
            </label>
            <textarea
              id="board-post-draft"
              maxLength={280}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="今日の学びや、みんなに聞きたいことは？"
              className="min-h-20 w-full resize-y border-0 bg-transparent px-0 py-2 leading-7 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
              <span className="text-xs font-bold text-slate-500">
                {draft.length} / 280
              </span>
              <button
                type="button"
                disabled={!draft.trim() || submitting}
                onClick={submitPost}
                className="min-h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {submitting ? "投稿中..." : "投稿する"}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm font-bold text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <div aria-live="polite" aria-busy={loading}>
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                pending={pendingIds.has(post.id)}
                onReply={setReplyPost}
                onLike={toggleLike}
                onPin={togglePin}
                onDelete={deletePost}
              />
            ))
          ) : (
            <p className="px-5 py-14 text-center text-sm font-bold text-slate-500">
              {loading ? "投稿を読み込んでいます..." : "まだ投稿はありません。"}
            </p>
          )}
        </div>

        {nextCursor ? (
          <div className="border-t border-slate-200 px-5 py-4 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => loadPosts(scope, nextCursor, true)}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? "読み込み中..." : "さらに読み込む"}
            </button>
          </div>
        ) : null}
      </section>

      {replyPost ? (
        <ReplyDialog
          post={replyPost}
          viewerName={viewer.displayName}
          onClose={closeReply}
          onSent={handleReplySent}
        />
      ) : null}
    </div>
  );
}

function ViewerAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700 sm:size-11"
    >
      {name.slice(0, 1)}
    </span>
  );
}
