import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MockError } from "@/lib/mock-exams/contract";
import { getMockAttempt } from "@/lib/mock-exams/read";
import MockAttempt from "./mock-attempt";

export const dynamic="force-dynamic";
export default async function MockAttemptPage({params}:{params:Promise<{attemptId:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/login");if(user.role.name!=="student")redirect("/teacher");
  const {attemptId}=await params;
  let view;
  try{view=await getMockAttempt(prisma,{id:user.id,roleName:user.role.name,status:user.status,deletedAt:user.deletedAt},attemptId);}
  catch(cause){return <StudentShell userName={user.displayName} avatarUrl={user.studentProfile?.avatarUrl ?? null}><ErrorCard message={cause instanceof MockError?cause.message:"受験を読み込めませんでした。"}/></StudentShell>;}
  if(view.kind==="result")redirect(`/mock-exam/attempts/${view.result.attemptId}/result`);
  return <StudentShell userName={user.displayName} avatarUrl={user.studentProfile?.avatarUrl ?? null}><MockAttempt key={view.attempt.id} initial={view.attempt}/></StudentShell>;
}
