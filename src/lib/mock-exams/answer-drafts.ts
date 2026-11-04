import type { AttemptView, SaveInput } from "./contract";

export type AnswerDrafts = Record<string, Pick<SaveInput, "requestId" | "selectedChoiceId">>;

export function addAnswerDraft(drafts: AnswerDrafts, input: SaveInput): AnswerDrafts {
  return { ...drafts, [input.mockQuestionId]: { requestId: input.requestId, selectedChoiceId: input.selectedChoiceId } };
}

export function settleAnswerDraft(drafts: AnswerDrafts, input: Pick<SaveInput, "mockQuestionId" | "requestId">): AnswerDrafts {
  if (drafts[input.mockQuestionId]?.requestId !== input.requestId) return drafts;
  const next = { ...drafts };
  delete next[input.mockQuestionId];
  return next;
}

export function projectAnswerDrafts(attempt: AttemptView, drafts: AnswerDrafts): AttemptView {
  if (Object.keys(drafts).length === 0) return attempt;
  return { ...attempt, answers: attempt.answers.map(answer => {
    const draft = drafts[answer.mockQuestionId];
    return draft ? { ...answer, selectedChoiceId: draft.selectedChoiceId } : answer;
  }) };
}
