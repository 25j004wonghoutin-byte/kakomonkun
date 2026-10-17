import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTokyoDate } from "@/lib/tokyo-date";
import { MockError } from "@/lib/mock-exams/contract";
import { getMockList } from "@/lib/mock-exams/read";
import MockExamList from "./mock-exam-list";

export const dynamic="force-dynamic";
export default async function MockExamPage({searchParams}:{searchParams:Promise<{month?:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/login");if(user.role.name!=="student")redirect("/teacher");
  const month=(await searchParams).month??getTokyoDate(new Date()).slice(0,7);
  let initial,error="";
  try{initial=await getMockList(prisma,{id:user.id,roleName:user.role.name,status:user.status,deletedAt:user.deletedAt},month);}
  catch(cause){error=cause instanceof MockError?cause.message:"模擬試験を読み込めませんでした。";}
  return <StudentShell>{initial?<MockExamList initial={initial}/>:<ErrorCard message={error}/>}</StudentShell>;
}
