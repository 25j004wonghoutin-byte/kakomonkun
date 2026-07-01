CREATE TABLE "titles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price_points" INTEGER NOT NULL,
    "rarity" VARCHAR(30) NOT NULL DEFAULT 'normal',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_qa_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "answer_date" DATE NOT NULL,
    "answered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer_point_awarded" BOOLEAN NOT NULL DEFAULT false,
    "correct_point_awarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_qa_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mock_exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "target_month" DATE NOT NULL,
    "description" TEXT,
    "time_limit_minutes" INTEGER,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "available_from" TIMESTAMPTZ(3),
    "available_until" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "mock_exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mock_exam_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mock_exam_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_no" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mock_exam_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mock_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mock_exam_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "total_questions" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "earned_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "mock_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mock_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "score_awarded" INTEGER NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mock_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_titles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "purchased_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipped_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monthly_rankings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_month" DATE NOT NULL,
    "user_id" UUID NOT NULL,
    "rank_no" INTEGER NOT NULL,
    "monthly_points" INTEGER NOT NULL DEFAULT 0,
    "mock_score" INTEGER,
    "reward_points" INTEGER NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monthly_rankings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "titles_name_key" ON "titles"("name");
CREATE INDEX "idx_titles_active_sort_order" ON "titles"("is_active", "sort_order");

CREATE UNIQUE INDEX "daily_qa_answers_user_id_answer_date_key" ON "daily_qa_answers"("user_id", "answer_date");
CREATE INDEX "idx_daily_qa_answers_question_id" ON "daily_qa_answers"("question_id");
CREATE INDEX "idx_daily_qa_answers_selected_choice_id" ON "daily_qa_answers"("selected_choice_id");
CREATE INDEX "idx_daily_qa_answers_answer_date" ON "daily_qa_answers"("answer_date");

CREATE UNIQUE INDEX "mock_exams_exam_id_target_month_key" ON "mock_exams"("exam_id", "target_month");
CREATE INDEX "idx_mock_exams_created_by" ON "mock_exams"("created_by");
CREATE INDEX "idx_mock_exams_status" ON "mock_exams"("status");
CREATE INDEX "idx_mock_exams_available_from" ON "mock_exams"("available_from");

CREATE UNIQUE INDEX "mock_exam_questions_mock_exam_id_question_id_key" ON "mock_exam_questions"("mock_exam_id", "question_id");
CREATE UNIQUE INDEX "mock_exam_questions_mock_exam_id_order_no_key" ON "mock_exam_questions"("mock_exam_id", "order_no");
CREATE INDEX "idx_mock_exam_questions_question_id" ON "mock_exam_questions"("question_id");

CREATE UNIQUE INDEX "mock_attempts_mock_exam_id_user_id_key" ON "mock_attempts"("mock_exam_id", "user_id");
CREATE INDEX "idx_mock_attempts_user_id" ON "mock_attempts"("user_id");
CREATE INDEX "idx_mock_attempts_status" ON "mock_attempts"("status");
CREATE INDEX "idx_mock_attempts_started_at" ON "mock_attempts"("started_at");

CREATE UNIQUE INDEX "mock_answers_attempt_id_question_id_key" ON "mock_answers"("attempt_id", "question_id");
CREATE INDEX "idx_mock_answers_question_id" ON "mock_answers"("question_id");
CREATE INDEX "idx_mock_answers_selected_choice_id" ON "mock_answers"("selected_choice_id");

CREATE UNIQUE INDEX "user_titles_user_id_title_id_key" ON "user_titles"("user_id", "title_id");
CREATE INDEX "idx_user_titles_title_id" ON "user_titles"("title_id");

CREATE UNIQUE INDEX "monthly_rankings_target_month_user_id_key" ON "monthly_rankings"("target_month", "user_id");
CREATE UNIQUE INDEX "monthly_rankings_target_month_rank_no_key" ON "monthly_rankings"("target_month", "rank_no");
CREATE INDEX "idx_monthly_rankings_user_id" ON "monthly_rankings"("user_id");

INSERT INTO "titles" ("name", "description", "price_points", "rarity", "sort_order", "updated_at") VALUES
('はじめの一歩', '学習を始めた学生向けの称号', 50, 'normal', 1, now()),
('努力家', '継続して学習する学生向けの称号', 100, 'normal', 2, now()),
('テクノロジーマスター', 'テクノロジ系を得意にする学生向けの称号', 300, 'rare', 3, now()),
('模擬試験チャレンジャー', '模擬試験に挑戦する学生向けの称号', 500, 'epic', 4, now())
ON CONFLICT ("name") DO UPDATE SET
    "description" = EXCLUDED."description",
    "price_points" = EXCLUDED."price_points",
    "rarity" = EXCLUDED."rarity",
    "sort_order" = EXCLUDED."sort_order",
    "updated_at" = now();

UPDATE "student_profiles" AS sp
SET "current_title_id" = NULL
WHERE sp."current_title_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "titles" AS t
    WHERE t."id" = sp."current_title_id"
  );

ALTER TABLE "student_profiles"
ADD CONSTRAINT "student_profiles_current_title_id_fkey"
FOREIGN KEY ("current_title_id") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "daily_qa_answers"
ADD CONSTRAINT "daily_qa_answers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_qa_answers"
ADD CONSTRAINT "daily_qa_answers_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_qa_answers"
ADD CONSTRAINT "daily_qa_answers_selected_choice_id_fkey"
FOREIGN KEY ("selected_choice_id") REFERENCES "question_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mock_exams"
ADD CONSTRAINT "mock_exams_exam_id_fkey"
FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mock_exams"
ADD CONSTRAINT "mock_exams_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mock_exam_questions"
ADD CONSTRAINT "mock_exam_questions_mock_exam_id_fkey"
FOREIGN KEY ("mock_exam_id") REFERENCES "mock_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mock_exam_questions"
ADD CONSTRAINT "mock_exam_questions_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mock_attempts"
ADD CONSTRAINT "mock_attempts_mock_exam_id_fkey"
FOREIGN KEY ("mock_exam_id") REFERENCES "mock_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mock_attempts"
ADD CONSTRAINT "mock_attempts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mock_answers"
ADD CONSTRAINT "mock_answers_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "mock_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mock_answers"
ADD CONSTRAINT "mock_answers_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mock_answers"
ADD CONSTRAINT "mock_answers_selected_choice_id_fkey"
FOREIGN KEY ("selected_choice_id") REFERENCES "question_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_titles"
ADD CONSTRAINT "user_titles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_titles"
ADD CONSTRAINT "user_titles_title_id_fkey"
FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "monthly_rankings"
ADD CONSTRAINT "monthly_rankings_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "titles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_qa_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mock_exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mock_exam_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mock_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mock_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_titles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_rankings" ENABLE ROW LEVEL SECURITY;
