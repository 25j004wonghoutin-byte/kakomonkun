import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { ErrorCard } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTokyoDate } from "@/lib/tokyo-date";
import { MockError, type ExamCode } from "@/lib/mock-exams/contract";
import { getMockRanking } from "@/lib/mock-exams/ranking";
import Ranking from "./ranking-view";

export const dynamic="force-dynamic";
export default async function RankingPage({searchParams}:{searchParams:Promise<{month?:string;examCode?:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/login");if(user.role.name!=="student")redirect("/teacher");
  const params=await searchParams,month=params.month??getTokyoDate(new Date()).slice(0,7),examCode=params.examCode??"it_passport";
  let initial,error="";
  try{initial=await getMockRanking(prisma,{id:user.id,roleName:user.role.name,status:user.status,deletedAt:user.deletedAt},examCode as ExamCode,month);}
  catch(cause){error=cause instanceof MockError?cause.message:"ランキングを取得できませんでした。";}
  return <StudentShell>{initial?<Ranking key={`${examCode}:${month}`} initial={initial}/>:<ErrorCard message={error}/>}</StudentShell>;
}
