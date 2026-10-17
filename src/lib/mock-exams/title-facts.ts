import type { Prisma } from "../../../prisma/generated/client";
import type { TitleCategory } from "../titles/contract";

/** 呼出元の機能フラグ確認後に使用。提出済みの最終非空回答だけを集約する。 */
export async function collectMockLearningFacts(tx:Prisma.TransactionClient,userId:string):Promise<{answerCount:number;categoryCorrect:Record<TitleCategory,number>}>{
  const where={attempt:{userId,status:"submitted"},selectedChoiceId:{not:null}};
  const answerCount=await tx.mockAnswer.count({where});
  const correct=await tx.mockAnswer.groupBy({by:["mockQuestionId"],where:{...where,isCorrect:true},_count:{_all:true}});
  const categoryCorrect:Record<TitleCategory,number>={technology:0,management:0,strategy:0};
  if(correct.length){
    const questions=await tx.mockExamQuestion.findMany({where:{id:{in:correct.map(row=>row.mockQuestionId)}},select:{id:true,categoryCode:true}});
    const categories=new Map(questions.map(q=>[q.id,q.categoryCode]));
    for(const row of correct){
      const code=categories.get(row.mockQuestionId);
      if(code==="technology"||code==="management"||code==="strategy")categoryCorrect[code]+=row._count._all;
    }
  }
  return {answerCount,categoryCorrect};
}
