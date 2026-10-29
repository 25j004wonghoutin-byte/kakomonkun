// SQL-boundary fixture only; real PostgreSQL equivalence tests validate joins and filters.
export function titleHistoryMemory(state, userId, mockEnabled) {
  const iso = value => value == null ? null : new Date(value).toISOString();
  const belongs = row => row.userId === undefined || row.userId === userId;
  const answer = row => ({ isCorrect: row.isCorrect ?? null, answeredAt: iso(row.answeredAt),
    categoryCode: (row.question ?? state.questions?.find(q=>q.id===row.questionId))?.category.code,
  });
  const mock = { answerCount: 0, categoryCorrect: { technology: 0, management: 0, strategy: 0 } };
  for (const row of state.mockAnswers) if (mockEnabled && row.attempt.userId === userId && row.attempt.status === "submitted" && row.selectedChoiceId !== null) {
    mock.answerCount++;
    if (row.isCorrect && Object.hasOwn(mock.categoryCorrect,row.mockQuestion.categoryCode)) mock.categoryCorrect[row.mockQuestion.categoryCode]++;
  }
  return {
    profile: state.profile && { titleTrackingStartedAt: iso(state.profile.titleTrackingStartedAt) },
    daily: state.daily.filter(belongs).map(row=>({...answer(row),answerDate:iso(row.answerDate)})),
    random: state.random.filter(row=>belongs(row)&&row.answeredAt!=null).sort((a,b)=>(a.answerSequence??0)-(b.answerSequence??0)).map(row=>({...answer(row),answerDate:iso(row.answerDate)})),
    practiceAnswers: state.practiceAnswers.filter(row=>!row.sessionId||state.sessions.some(s=>s.id===row.sessionId&&s.userId===userId)).map(answer),
    sessions: state.sessions.filter(row=>belongs(row)&&row.status==="completed").slice().sort((a,b)=>+a.completedAt-+b.completedAt).map(({questionCount,answeredCount,correctCount})=>({questionCount,answeredCount,correctCount})),
    owned: state.owned.map(key=>({titleId:key,catalogKey:key.startsWith("v1-")?key:null})),
    boardPostCount:state.posts.filter(row=>!row.authorId||row.authorId===userId).length,
    boardCommentCount:state.comments.filter(row=>!row.authorId||row.authorId===userId).length,
    mock,
    rankings:mockEnabled?state.rankings.filter(row=>row.userId===userId&&row.isFinal&&row.mockExam?.rankingFinalizedAt!=null&&["it_passport","fe"].includes(row.mockExam.exam.code)).map(row=>({rankNo:row.rankNo,targetMonth:iso(row.targetMonth),examCode:row.mockExam.exam.code})):[],
  };
}
