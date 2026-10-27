import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StudentShell } from "@/components/student-shell";
import { ReviewNotebookClient } from "./review-notebook-client";
export default async function ReviewNotebookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student") redirect("/teacher");
  return <StudentShell userName={user.displayName} avatarUrl={user.studentProfile?.avatarUrl ?? null}><Suspense fallback={<p role="status">復習ノートを読み込み中…</p>}><ReviewNotebookClient key={user.id} ownerId={user.id} /></Suspense></StudentShell>;
}
