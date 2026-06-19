CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID,
    "role_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "student_no" VARCHAR(50),
    "avatar_url" TEXT,
    "bio" TEXT,
    "current_title_id" UUID,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "total_practice_count" INTEGER NOT NULL DEFAULT 0,
    "total_correct_count" INTEGER NOT NULL DEFAULT 0,
    "total_answer_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "teacher_no" VARCHAR(50),
    "department" VARCHAR(100),
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "question_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "source_year" INTEGER,
    "source_season" VARCHAR(30),
    "question_no" INTEGER,
    "question_text" TEXT NOT NULL,
    "explanation" TEXT,
    "question_type" VARCHAR(30) NOT NULL DEFAULT 'single_choice',
    "difficulty" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'published',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_choices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "choice_label" VARCHAR(10) NOT NULL,
    "choice_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "question_choices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_users_role_id" ON "users"("role_id");
CREATE INDEX "idx_users_status" ON "users"("status");
CREATE UNIQUE INDEX "student_profiles_student_no_key" ON "student_profiles"("student_no");
CREATE UNIQUE INDEX "teacher_profiles_teacher_no_key" ON "teacher_profiles"("teacher_no");
CREATE UNIQUE INDEX "exams_code_key" ON "exams"("code");
CREATE UNIQUE INDEX "question_categories_code_key" ON "question_categories"("code");
CREATE INDEX "idx_questions_exam_id" ON "questions"("exam_id");
CREATE INDEX "idx_questions_category_id" ON "questions"("category_id");
CREATE INDEX "idx_questions_status" ON "questions"("status");
CREATE INDEX "idx_questions_source" ON "questions"("source_year", "source_season", "question_no");
CREATE UNIQUE INDEX "question_choices_question_id_choice_label_key" ON "question_choices"("question_id", "choice_label");
CREATE UNIQUE INDEX "question_choices_question_id_sort_order_key" ON "question_choices"("question_id", "sort_order");
CREATE INDEX "idx_question_choices_question_id" ON "question_choices"("question_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_profiles"
ADD CONSTRAINT "student_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_profiles"
ADD CONSTRAINT "teacher_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_exam_id_fkey"
FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "question_choices"
ADD CONSTRAINT "question_choices_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_choices" ENABLE ROW LEVEL SECURITY;
