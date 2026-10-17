-- 呼出元のtransaction内で適用し、既存の開始IDも失わず引き継ぐ。
LOCK TABLE public.mock_attempts IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.mock_attempt_start_requests (
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  mock_exam_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT mock_attempt_start_requests_pkey PRIMARY KEY (user_id,request_id),
  CONSTRAINT mock_attempt_start_requests_attempt_fkey FOREIGN KEY (attempt_id,mock_exam_id,user_id)
    REFERENCES public.mock_attempts(id,mock_exam_id,user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_mock_attempt_start_requests_attempt ON public.mock_attempt_start_requests(attempt_id,mock_exam_id,user_id);
INSERT INTO public.mock_attempt_start_requests(user_id,request_id,mock_exam_id,attempt_id,created_at)
  SELECT user_id,start_request_id,mock_exam_id,id,created_at FROM public.mock_attempts;
ALTER TABLE public.mock_attempt_start_requests ENABLE ROW LEVEL SECURITY;
-- 元の受験・開始ID・回答は更新しない。ブラウザー向けポリシーを追加しない。
