import { notFound, redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { getCurrentUser } from "@/lib/auth";
import { getBoardThread } from "@/lib/board/read";
import { isUuid } from "@/lib/board/validation";
import { PostDetail } from "./post-detail";

export const dynamic = "force-dynamic";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { postId } = await params;
  if (!isUuid(postId)) {
    notFound();
  }

  const thread = await getBoardThread(user.id, postId);
  if (!thread) {
    notFound();
  }

  return (
    <StudentShell userName={user.displayName}>
      <PostDetail initialThread={thread} viewerName={user.displayName} />
    </StudentShell>
  );
}
