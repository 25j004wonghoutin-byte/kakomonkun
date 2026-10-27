import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { getCurrentUser } from "@/lib/auth";
import { parseReviewId } from "@/lib/review-notebook/request";
import { ReviewQuestionClient } from "./review-question-client";
export default async function ReviewQuestionPage({ params }: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student") redirect("/teacher");
  const { itemId } = await params;
  try { parseReviewId(itemId); } catch { notFound(); }
  return <StudentShell userName={user.displayName} avatarUrl={user.studentProfile?.avatarUrl ?? null}><Suspense fallback={<p role="status">問題を読み込み中…</p>}><ReviewQuestionClient key={`${user.id}:${itemId}`} itemId={itemId} ownerId={user.id} /></Suspense></StudentShell>;
}
