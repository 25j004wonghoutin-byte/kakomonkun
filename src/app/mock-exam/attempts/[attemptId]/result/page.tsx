import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MockError } from "@/lib/mock-exams/contract";
import { getMockResult } from "@/lib/mock-exams/read";
import MockResult from "./mock-result";

export const dynamic="force-dynamic";
export default async function MockResultPage({params}:{params:Promise<{attemptId:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/login");if(user.role.name!=="student")redirect("/teacher");
  const {attemptId}=await params;
  let result,error="";
  try{result=await getMockResult(prisma,{id:user.id,roleName:user.role.name,status:user.status,deletedAt:user.deletedAt},attemptId);}
  catch(cause){error=cause instanceof MockError?cause.message:"結果を読み込めませんでした。";}
  return <StudentShell userName={user.displayName} avatarUrl={user.studentProfile?.avatarUrl ?? null}>{result?<MockResult result={result}/>:<ErrorCard message={error}/>}</StudentShell>;
}
