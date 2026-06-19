CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'in_progress',
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "answered_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "earned_points" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_session_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_no" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_session_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "order_no" INTEGER NOT NULL,
    "answered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "source_type" VARCHAR(50),
    "source_id" UUID,
    "transaction_date" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_practice_sessions_user_id" ON "practice_sessions"("user_id");
CREATE INDEX "idx_practice_sessions_exam_id" ON "practice_sessions"("exam_id");
CREATE INDEX "idx_practice_sessions_started_at" ON "practice_sessions"("started_at");
CREATE INDEX "idx_practice_sessions_status" ON "practice_sessions"("status");
CREATE UNIQUE INDEX "practice_session_questions_session_id_question_id_key" ON "practice_session_questions"("session_id", "question_id");
CREATE UNIQUE INDEX "practice_session_questions_session_id_order_no_key" ON "practice_session_questions"("session_id", "order_no");
CREATE INDEX "idx_practice_session_questions_question_id" ON "practice_session_questions"("question_id");
CREATE UNIQUE INDEX "practice_answers_session_id_question_id_key" ON "practice_answers"("session_id", "question_id");
CREATE UNIQUE INDEX "practice_answers_session_id_order_no_key" ON "practice_answers"("session_id", "order_no");
CREATE INDEX "idx_practice_answers_question_id" ON "practice_answers"("question_id");
CREATE INDEX "idx_practice_answers_selected_choice_id" ON "practice_answers"("selected_choice_id");
CREATE UNIQUE INDEX "point_transactions_idempotency_key" ON "point_transactions"("user_id", "reason", "source_type", "source_id");
CREATE INDEX "idx_point_transactions_user_date" ON "point_transactions"("user_id", "transaction_date");
CREATE INDEX "idx_point_transactions_reason_date" ON "point_transactions"("reason", "transaction_date");

ALTER TABLE "practice_sessions"
ADD CONSTRAINT "practice_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_sessions"
ADD CONSTRAINT "practice_sessions_exam_id_fkey"
FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_session_questions"
ADD CONSTRAINT "practice_session_questions_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_session_questions"
ADD CONSTRAINT "practice_session_questions_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_answers"
ADD CONSTRAINT "practice_answers_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_answers"
ADD CONSTRAINT "practice_answers_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_answers"
ADD CONSTRAINT "practice_answers_selected_choice_id_fkey"
FOREIGN KEY ("selected_choice_id") REFERENCES "question_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "point_transactions"
ADD CONSTRAINT "point_transactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_session_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "point_transactions" ENABLE ROW LEVEL SECURITY;
