import type { Prisma } from "../../../prisma/generated/client";

export type ExamCode = "it_passport" | "fe";
/** 実在するYYYY-MMかは、HTTP境界と日程計算で検証する。 */
export type MonthKey = string;

export type MockActor = {
  id: string;
  roleName: string;
  status: string;
  deletedAt: Date | null;
};

export class MockError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = "MockError";
  }
}

export type MockSchedule = {
  month: MonthKey;
  opensAt: Date;
  closesAt: Date;
  reminderAt: Date;
};

export type MockPolicy = {
  readonly questionCount: number;
  readonly timeLimitMinutes: number;
  readonly maxAttempts: 2;
  readonly participationPoints: 20;
};

export type StartInput = { mockExamId: string; requestId: string };
export type SaveInput = {
  attemptId: string;
  mockQuestionId: string;
  selectedChoiceId: string | null;
  expectedRevision: number;
  requestId: string;
};
export type SubmitInput = { attemptId: string; expectedRevision: number };

/** 正解・正誤・解説を含まない、受験中の公開契約。 */
export type MockQuestionView = {
  id: string;
  orderNo: number;
  questionText: string;
  imagePath: string | null;
  sourceLabel: string;
  choices: { id: string; label: string; text: string; orderNo: number }[];
};

export type SavedAnswerView = {
  mockQuestionId: string;
  selectedChoiceId: string | null;
  revision: number;
};

export type AttemptView = {
  id: string;
  mockExamId: string;
  attemptNo: 1 | 2;
  status: "in_progress" | "submitted";
  startedAt: string;
  expiresAt: string;
  serverNow: string;
  revision: number;
  questions: MockQuestionView[];
  answers: SavedAnswerView[];
};

export type ReviewQuestionView = MockQuestionView & {
  selectedChoiceId: string | null;
  correctChoiceId: string;
  isCorrect: boolean;
  explanation: string;
};

export type ResultView = {
  attemptId: string;
  mockExamId: string;
  attemptNo: 1 | 2;
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
  score: number;
  earnedPoints: number;
  bestAttemptId: string;
  bestScore: number;
  submittedAt: string;
  reviewAvailableAt: string;
  review: ReviewQuestionView[] | null;
};

export type StartResult =
  | { kind: "attempt"; attempt: AttemptView }
  | { kind: "result"; result: ResultView };

export type SaveResult =
  | { kind: "saved"; answer: SavedAnswerView; attemptRevision: number; serverNow: string }
  | { kind: "submitted"; result: ResultView };

export type MockExamCardView = {
  id: string | null;
  examCode: ExamCode;
  title: string;
  questionCount: number;
  timeLimitMinutes: number;
  opensAt: string;
  closesAt: string;
  state: "preparing" | "upcoming" | "open" | "closed";
  remainingAttempts: number;
  activeAttemptId: string | null;
  results: ResultView[];
};

export type MockListView = {
  month: MonthKey;
  historyMonths: MonthKey[];
  exams: MockExamCardView[];
};

export type RankResult = {
  userId: string;
  attemptId: string;
  attemptNo: 1 | 2;
  correctCount: number;
  totalQuestions: number;
};
export type RankedResult = RankResult & { rankNo: number; score: number };

export type RankingStudentView = {
  userId: string;
  rankNo: number;
  score: number;
  displayName: string;
  avatarUrl: string | null;
  currentTitleName: string | null;
  profileHref: string | null;
};

export type RankingView = {
  examCode: ExamCode;
  month: MonthKey;
  availableMonths: MonthKey[];
  state: "provisional" | "settling" | "final";
  top: RankingStudentView[];
  mine: RankingStudentView | null;
  rewardsComplete: boolean;
};

/** DB接続と時計を束縛した、サーバー側サービスの境界。 */
export type MockServices = {
  getMockList(actor: MockActor, month: MonthKey): Promise<MockListView>;
  startMockAttempt(actor: MockActor, input: StartInput): Promise<StartResult>;
  getMockAttempt(actor: MockActor, attemptId: string): Promise<StartResult>;
  saveMockAnswer(actor: MockActor, input: SaveInput): Promise<SaveResult>;
  submitMockAttempt(actor: MockActor, input: SubmitInput): Promise<ResultView>;
  getMockResult(actor: MockActor, attemptId: string): Promise<ResultView>;
  getRanking(actor: MockActor, examCode: ExamCode, month: MonthKey): Promise<RankingView>;
};

export type MockClock = (tx: Prisma.TransactionClient) => Promise<Date>;
