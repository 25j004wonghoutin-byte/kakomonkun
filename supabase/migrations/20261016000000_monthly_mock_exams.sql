-- 呼出元のtransaction内で適用する。既存の模試データがあれば変更しない。
LOCK TABLE public.mock_exams, public.mock_exam_questions, public.mock_attempts,
  public.mock_answers, public.monthly_rankings IN ACCESS EXCLUSIVE MODE;
DO $mock_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mock_exams)
    OR EXISTS (SELECT 1 FROM public.mock_exam_questions)
    OR EXISTS (SELECT 1 FROM public.mock_attempts)
    OR EXISTS (SELECT 1 FROM public.mock_answers)
    OR EXISTS (SELECT 1 FROM public.monthly_rankings) THEN
    RAISE EXCEPTION 'MOCK_TABLES_NOT_EMPTY: preserve existing data and request a migration decision';
  END IF;
END $mock_guard$;

ALTER TABLE public.mock_exams
  ALTER COLUMN time_limit_minutes SET NOT NULL,
  ALTER COLUMN available_from SET NOT NULL,
  ALTER COLUMN available_until SET NOT NULL,
  ADD COLUMN ranking_finalized_at timestamptz(3),
  ADD COLUMN rewards_completed_at timestamptz(3),
  ADD CONSTRAINT mock_exams_id_month_key UNIQUE (id, target_month),
  ADD CONSTRAINT mock_exams_month_check CHECK (EXTRACT(DAY FROM target_month) = 1),
  ADD CONSTRAINT mock_exams_policy_check CHECK (
    (question_count = 100 AND time_limit_minutes = 120)
    OR (question_count = 60 AND time_limit_minutes = 90)
  ),
  ADD CONSTRAINT mock_exams_window_check CHECK (
    available_from = (target_month::timestamp AT TIME ZONE 'Asia/Tokyo')
    AND available_until = ((target_month + interval '24 days')::timestamp AT TIME ZONE 'Asia/Tokyo')
  ),
  ADD CONSTRAINT mock_exams_rewards_finalized_check CHECK (
    rewards_completed_at IS NULL OR ranking_finalized_at IS NOT NULL
  );

ALTER TABLE public.mock_exam_questions
  ADD COLUMN question_text text NOT NULL,
  ADD COLUMN image_path text,
  ADD COLUMN explanation text,
  ADD COLUMN category_code varchar(50) NOT NULL,
  ADD COLUMN source_key varchar(120) NOT NULL,
  ADD COLUMN source_year integer NOT NULL,
  ADD COLUMN source_season varchar(30),
  ADD COLUMN question_no integer,
  ADD COLUMN source_label varchar(200) NOT NULL,
  ADD CONSTRAINT mock_exam_questions_id_exam_key UNIQUE (id, mock_exam_id),
  ADD CONSTRAINT mock_exam_questions_order_check CHECK (order_no BETWEEN 1 AND 100),
  ADD CONSTRAINT mock_exam_questions_weight_check CHECK (score = 1);

CREATE TABLE public.mock_exam_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_exam_id uuid NOT NULL,
  mock_question_id uuid NOT NULL,
  original_choice_id uuid,
  choice_label varchar(10) NOT NULL,
  choice_text text NOT NULL,
  is_correct boolean NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 1 AND 4),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT mock_exam_choices_question_fkey FOREIGN KEY (mock_question_id, mock_exam_id)
    REFERENCES public.mock_exam_questions(id, mock_exam_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT mock_exam_choices_id_question_exam_key UNIQUE (id, mock_question_id, mock_exam_id),
  CONSTRAINT mock_exam_choices_question_label_key UNIQUE (mock_question_id, choice_label),
  CONSTRAINT mock_exam_choices_question_order_key UNIQUE (mock_question_id, sort_order)
);
CREATE INDEX idx_mock_exam_choices_question_exam ON public.mock_exam_choices(mock_question_id, mock_exam_id);
CREATE INDEX idx_mock_exam_choices_exam ON public.mock_exam_choices(mock_exam_id);

DROP INDEX public.mock_attempts_mock_exam_id_user_id_key;
ALTER TABLE public.mock_attempts
  DROP CONSTRAINT mock_attempts_mock_exam_id_fkey,
  DROP CONSTRAINT mock_attempts_user_id_fkey,
  ADD COLUMN start_request_id uuid NOT NULL,
  ADD COLUMN attempt_no integer NOT NULL CHECK (attempt_no IN (1, 2)),
  ADD COLUMN expires_at timestamptz(3) NOT NULL,
  ADD COLUMN graded_at timestamptz(3),
  ADD COLUMN answered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ALTER COLUMN score TYPE numeric(5,2) USING score::numeric(5,2),
  ADD CONSTRAINT mock_attempts_mock_exam_id_fkey FOREIGN KEY (mock_exam_id) REFERENCES public.mock_exams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT mock_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT mock_attempts_exam_user_number_key UNIQUE (mock_exam_id, user_id, attempt_no),
  ADD CONSTRAINT mock_attempts_user_start_request_key UNIQUE (user_id, start_request_id),
  ADD CONSTRAINT mock_attempts_id_exam_key UNIQUE (id, mock_exam_id),
  ADD CONSTRAINT mock_attempts_id_exam_user_key UNIQUE (id, mock_exam_id, user_id),
  ADD CONSTRAINT mock_attempts_counts_check CHECK (
    total_questions > 0 AND total_questions <= 100 AND answered_count BETWEEN 0 AND total_questions
    AND correct_count BETWEEN 0 AND answered_count AND score BETWEEN 0 AND 100 AND earned_points >= 0
  ),
  ADD CONSTRAINT mock_attempts_deadline_check CHECK (expires_at > started_at),
  ADD CONSTRAINT mock_attempts_state_check CHECK (
    (status = 'in_progress' AND submitted_at IS NULL AND graded_at IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND graded_at IS NOT NULL
      AND submitted_at >= started_at AND submitted_at <= expires_at)
  );
CREATE UNIQUE INDEX mock_attempts_one_in_progress ON public.mock_attempts(mock_exam_id, user_id) WHERE status = 'in_progress';
CREATE INDEX idx_mock_attempts_due ON public.mock_attempts(status, expires_at, id);
CREATE INDEX idx_mock_attempts_exam_status_user ON public.mock_attempts(mock_exam_id, status, user_id);

DROP INDEX public.mock_answers_attempt_id_question_id_key;
DROP INDEX public.idx_mock_answers_question_id;
DROP INDEX public.idx_mock_answers_selected_choice_id;
ALTER TABLE public.mock_answers
  DROP CONSTRAINT mock_answers_attempt_id_fkey,
  DROP CONSTRAINT mock_answers_question_id_fkey,
  DROP CONSTRAINT mock_answers_selected_choice_id_fkey,
  DROP COLUMN question_id,
  ADD COLUMN mock_exam_id uuid NOT NULL,
  ADD COLUMN mock_question_id uuid NOT NULL,
  ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN last_request_id uuid,
  ALTER COLUMN selected_choice_id DROP NOT NULL,
  ALTER COLUMN is_correct DROP NOT NULL,
  ADD CONSTRAINT mock_answers_attempt_fkey FOREIGN KEY (attempt_id, mock_exam_id)
    REFERENCES public.mock_attempts(id, mock_exam_id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT mock_answers_question_fkey FOREIGN KEY (mock_question_id, mock_exam_id)
    REFERENCES public.mock_exam_questions(id, mock_exam_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT mock_answers_choice_fkey FOREIGN KEY (selected_choice_id, mock_question_id, mock_exam_id)
    REFERENCES public.mock_exam_choices(id, mock_question_id, mock_exam_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT mock_answers_attempt_question_key UNIQUE (attempt_id, mock_question_id),
  ADD CONSTRAINT mock_answers_selection_check CHECK (
    (selected_choice_id IS NULL AND answered_at IS NULL) OR (selected_choice_id IS NOT NULL AND answered_at IS NOT NULL)
  ),
  ADD CONSTRAINT mock_answers_revision_request_check CHECK (
    (revision = 0 AND last_request_id IS NULL) OR (revision > 0 AND last_request_id IS NOT NULL)
  );
CREATE INDEX idx_mock_answers_question_exam ON public.mock_answers(mock_question_id, mock_exam_id);
CREATE INDEX idx_mock_answers_choice_question_exam ON public.mock_answers(selected_choice_id, mock_question_id, mock_exam_id);

DROP INDEX public.monthly_rankings_target_month_user_id_key;
DROP INDEX public.monthly_rankings_target_month_rank_no_key;
ALTER TABLE public.monthly_rankings
  DROP CONSTRAINT monthly_rankings_user_id_fkey,
  ADD COLUMN mock_exam_id uuid NOT NULL,
  ADD COLUMN best_attempt_id uuid NOT NULL,
  ADD COLUMN correct_count integer NOT NULL,
  ADD COLUMN total_questions integer NOT NULL,
  ADD COLUMN is_final boolean NOT NULL DEFAULT false,
  ADD COLUMN reward_processed_at timestamptz(3),
  ALTER COLUMN mock_score TYPE numeric(5,2) USING mock_score::numeric(5,2),
  ALTER COLUMN mock_score SET NOT NULL,
  ADD CONSTRAINT monthly_rankings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT monthly_rankings_exam_fkey FOREIGN KEY (mock_exam_id, target_month)
    REFERENCES public.mock_exams(id, target_month) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT monthly_rankings_best_attempt_fkey FOREIGN KEY (best_attempt_id, mock_exam_id, user_id)
    REFERENCES public.mock_attempts(id, mock_exam_id, user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT monthly_rankings_exam_user_key UNIQUE (mock_exam_id, user_id),
  ADD CONSTRAINT monthly_rankings_values_check CHECK (
    rank_no > 0 AND total_questions > 0 AND correct_count BETWEEN 0 AND total_questions
    AND mock_score BETWEEN 0 AND 100 AND reward_points >= 0
  );
CREATE INDEX idx_monthly_rankings_exam_rank ON public.monthly_rankings(mock_exam_id, rank_no);
CREATE INDEX idx_monthly_rankings_best_attempt ON public.monthly_rankings(best_attempt_id, mock_exam_id, user_id);
CREATE INDEX idx_monthly_rankings_user_month ON public.monthly_rankings(user_id, target_month);

CREATE TABLE public.mock_exam_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key varchar(200) NOT NULL UNIQUE,
  kind varchar(30) NOT NULL,
  target_month date NOT NULL CHECK (EXTRACT(DAY FROM target_month) = 1),
  exam_code varchar(50),
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz(3),
  next_run_at timestamptz(3) NOT NULL DEFAULT now(),
  cursor text,
  last_error_code varchar(80),
  last_error_at timestamptz(3),
  completed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT mock_exam_job_runs_lease_check CHECK (
    (status = 'running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'running' AND lease_token IS NULL AND lease_until IS NULL)
  )
);
CREATE INDEX idx_mock_exam_job_runs_due ON public.mock_exam_job_runs(status,next_run_at);
CREATE INDEX idx_mock_exam_job_runs_lease ON public.mock_exam_job_runs(lease_until);

ALTER TABLE public.notifications
  ADD COLUMN target_month date,
  DROP CONSTRAINT notifications_type_check,
  DROP CONSTRAINT notifications_target_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN ('board_reply','board_pinned','title_unlocked','mock_exam_reminder')),
  ADD CONSTRAINT notifications_target_check CHECK (
    (type='board_reply' AND actor_id IS NOT NULL AND board_comment_id IS NOT NULL AND board_post_id IS NULL AND title_id IS NULL AND target_month IS NULL)
    OR (type='board_pinned' AND actor_id IS NOT NULL AND board_post_id IS NOT NULL AND board_comment_id IS NULL AND title_id IS NULL AND target_month IS NULL)
    OR (type='title_unlocked' AND actor_id IS NULL AND title_id IS NOT NULL AND board_post_id IS NULL AND board_comment_id IS NULL AND target_month IS NULL)
    OR (type='mock_exam_reminder' AND actor_id IS NULL AND title_id IS NULL AND board_post_id IS NULL AND board_comment_id IS NULL AND target_month IS NOT NULL AND EXTRACT(DAY FROM target_month)=1)
  ),
  ADD CONSTRAINT notifications_recipient_type_month_key UNIQUE (recipient_id,type,target_month);

ALTER TABLE public.mock_exam_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exam_job_runs ENABLE ROW LEVEL SECURITY;
-- 元データ・所有称号・ポイント・既存通知の行は更新しない。公開ポリシーも追加しない。
