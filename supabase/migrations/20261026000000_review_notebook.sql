-- Additive only. Apply before deploying the review notebook application.
CREATE TABLE public.review_notebook_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'unreviewed',
  first_wrong_at timestamptz(3) NOT NULL,
  last_wrong_at timestamptz(3) NOT NULL,
  last_reviewed_at timestamptz(3),
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT review_items_user_question_key UNIQUE (user_id, question_id),
  CONSTRAINT review_items_id_user_key UNIQUE (id, user_id),
  CONSTRAINT review_items_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT review_items_question_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT review_items_status_check CHECK (status IN ('unreviewed', 'reviewing', 'reviewed')),
  CONSTRAINT review_items_revision_check CHECK (revision >= 0)
);
CREATE INDEX idx_review_items_user_status_wrong ON public.review_notebook_items(user_id, status, last_wrong_at DESC, id);
CREATE INDEX idx_review_items_user_wrong ON public.review_notebook_items(user_id, last_wrong_at DESC, id);
CREATE INDEX idx_review_items_question ON public.review_notebook_items(question_id);

CREATE TABLE public.review_notebook_answers (
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  item_id uuid NOT NULL,
  expected_revision integer NOT NULL,
  question_version varchar(64) NOT NULL,
  selected_choice_id uuid NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz(3) NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (user_id, request_id),
  CONSTRAINT review_answers_item_revision_key UNIQUE (item_id, expected_revision),
  CONSTRAINT review_answers_item_user_fkey FOREIGN KEY (item_id, user_id) REFERENCES public.review_notebook_items(id, user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT review_answers_choice_fkey FOREIGN KEY (selected_choice_id) REFERENCES public.question_choices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT review_answers_revision_check CHECK (expected_revision >= 0),
  CONSTRAINT review_answers_version_check CHECK (question_version ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idx_review_answers_item_user ON public.review_notebook_answers(item_id, user_id);
CREATE INDEX idx_review_answers_choice ON public.review_notebook_answers(selected_choice_id);

ALTER TABLE public.review_notebook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_notebook_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_notebook_items, public.review_notebook_answers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.review_notebook_items, public.review_notebook_answers TO service_role;
