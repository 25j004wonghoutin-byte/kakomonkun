-- 追加のみ。既存の所有・装備・回答・ポイント履歴は変更しない。
ALTER TABLE public.titles
  ADD COLUMN catalog_key varchar(30),
  ADD COLUMN acquisition_kind varchar(30),
  ADD CONSTRAINT titles_catalog_key_key UNIQUE (catalog_key),
  ADD CONSTRAINT titles_price_nonnegative CHECK (price_points >= 0),
  ADD CONSTRAINT titles_acquisition_kind_check CHECK (
    acquisition_kind IS NULL OR acquisition_kind IN ('starter', 'points', 'condition')
  ),
  ADD CONSTRAINT titles_acquisition_price_check CHECK (
    acquisition_kind IS NULL
    OR (acquisition_kind = 'points' AND price_points > 0)
    OR (acquisition_kind IN ('starter', 'condition') AND price_points = 0)
  );

ALTER TABLE public.student_profiles
  ADD COLUMN title_backfilled_at timestamptz(3),
  ADD COLUMN title_tracking_started_at timestamptz(3);

CREATE TABLE public.user_title_unlocks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.titles(id) ON DELETE RESTRICT,
  unlocked_at timestamptz(3) NOT NULL DEFAULT now(),
  source varchar(30) NOT NULL CHECK (source IN ('backfill', 'event')),
  PRIMARY KEY (user_id, title_id)
);
CREATE INDEX idx_user_title_unlocks_title_id ON public.user_title_unlocks(title_id);

CREATE TABLE public.random_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  issued_at timestamptz(3) NOT NULL DEFAULT now(),
  selected_choice_id uuid REFERENCES public.question_choices(id) ON DELETE RESTRICT,
  is_correct boolean,
  answer_date date,
  answered_at timestamptz(3),
  answer_sequence integer,
  CONSTRAINT random_quiz_attempts_user_sequence_key UNIQUE (user_id, answer_sequence),
  CONSTRAINT random_quiz_attempts_sequence_positive CHECK (answer_sequence > 0),
  CONSTRAINT random_quiz_attempts_answer_consistency CHECK (
    (selected_choice_id IS NULL AND is_correct IS NULL AND answer_date IS NULL
      AND answered_at IS NULL AND answer_sequence IS NULL)
    OR
    (selected_choice_id IS NOT NULL AND is_correct IS NOT NULL AND answer_date IS NOT NULL
      AND answered_at IS NOT NULL AND answer_sequence IS NOT NULL)
  )
);
CREATE INDEX idx_random_quiz_attempts_user_date_sequence
  ON public.random_quiz_attempts(user_id, answer_date, answer_sequence);
CREATE INDEX idx_random_quiz_attempts_question_id ON public.random_quiz_attempts(question_id);
CREATE INDEX idx_random_quiz_attempts_selected_choice_id ON public.random_quiz_attempts(selected_choice_id);

CREATE TABLE public.student_activity_days (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  has_answered boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz(3) NOT NULL DEFAULT now(),
  last_seen_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date)
);

CREATE TABLE public.student_navigation_progress (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tab_id varchar(100) NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  stage varchar(30) NOT NULL DEFAULT 'idle' CHECK (stage IN ('idle', 'home', 'profile')),
  round_trips integer NOT NULL DEFAULT 0 CHECK (round_trips >= 0),
  PRIMARY KEY (user_id, tab_id)
);

-- ブラウザーからの直接アクセスは許可しない。サーバーのPrisma接続で利用する。
ALTER TABLE public.user_title_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.random_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_navigation_progress ENABLE ROW LEVEL SECURITY;

-- 同名の既存行はIDを維持する。別の行と固定キーが衝突したらunique制約で失敗する。
INSERT INTO public.titles (catalog_key, name, price_points, acquisition_kind, sort_order, updated_at)
SELECT catalog_key, name, price_points, acquisition_kind, sort_order, now()
FROM (VALUES
  ('v1-001', '過去問くん', 0, 'condition', 1),
  ('v1-002', 'ランダム名人', 0, 'condition', 2),
  ('v1-003', 'ランダム仙人', 0, 'condition', 3),
  ('v1-004', 'I LOVE テクノロジ', 0, 'condition', 4),
  ('v1-005', 'I LOVE マネジメント', 0, 'condition', 5),
  ('v1-006', 'I LOVE ストラテジ', 0, 'condition', 6),
  ('v1-007', '継続は力なり', 0, 'condition', 7),
  ('v1-008', 'はじめの一歩', 0, 'condition', 8),
  ('v1-009', 'チャンピオン', 0, 'condition', 9),
  ('v1-010', '努力家', 0, 'condition', 10),
  ('v1-011', 'ランキング猛者', 0, 'condition', 11),
  ('v1-012', '富豪', 500, 'points', 12),
  ('v1-013', '大富豪', 1000, 'points', 13),
  ('v1-014', '駆け出しのエンジニア', 0, 'starter', 14),
  ('v1-015', '継続神', 0, 'condition', 15),
  ('v1-016', '逆に天才', 0, 'condition', 16),
  ('v1-017', 'ログインマン', 0, 'condition', 17),
  ('v1-018', 'ITパスポート頑張ります', 10, 'points', 18),
  ('v1-019', '基本情報頑張ります', 10, 'points', 19),
  ('v1-020', '三日坊主', 0, 'condition', 20),
  ('v1-021', 'ランダム神', 0, 'condition', 21),
  ('v1-022', '称号マニア', 0, 'condition', 22),
  ('v1-023', '発信者', 0, 'condition', 23),
  ('v1-024', 'おしゃべり', 0, 'condition', 24),
  ('v1-025', 'テクノロジ苦手です', 10, 'points', 25),
  ('v1-026', 'マネジメント苦手です', 10, 'points', 26),
  ('v1-027', 'ストラテジ苦手です', 10, 'points', 27),
  ('v1-028', 'テクノロジ頑張ります', 10, 'points', 28),
  ('v1-029', 'マネジメント頑張ります', 10, 'points', 29),
  ('v1-030', 'ストラテジ頑張ります', 10, 'points', 30),
  ('v1-031', 'テクノロジ好き', 20, 'points', 31),
  ('v1-032', 'マネジメント好き', 20, 'points', 32),
  ('v1-033', 'ストラテジ好き', 20, 'points', 33),
  ('v1-034', '億万長者', 3000, 'points', 34),
  ('v1-035', 'やはり天才か', 0, 'condition', 35),
  ('v1-036', 'レアキャラ', 0, 'condition', 36),
  ('v1-037', 'それは意味がありません', 0, 'condition', 37),
  ('v1-038', '不屈の精神', 0, 'condition', 38),
  ('v1-039', '汝は何処を目指すのか', 0, 'condition', 39),
  ('v1-040', 'シルバーコレクター', 0, 'condition', 40),
  ('v1-041', 'ブロンズコレクター', 0, 'condition', 41),
  ('v1-042', '銀メダル', 0, 'condition', 42),
  ('v1-043', '銅メダル', 0, 'condition', 43),
  ('v1-044', 'ゴールドコレクター', 0, 'condition', 44),
  ('v1-045', 'ITへの挑戦者', 30, 'points', 45),
  ('v1-046', '隣の人間国宝', 70, 'points', 46),
  ('v1-047', '長考します', 30, 'points', 47),
  ('v1-048', '合格間違いなし', 0, 'condition', 48),
  ('v1-049', 'Hello World', 2, 'points', 49),
  ('v1-050', '名前を入力してください。', 0, 'condition', 50),
  ('v1-051', 'エラー落ち', 404, 'points', 51),
  ('v1-052', '404 NOT FOUND', 404, 'points', 52),
  ('v1-053', '見た目は二進制、値段は十進制', 101, 'points', 53),
  ('v1-054', '自宅セキュリティ', 40, 'points', 54),
  ('v1-055', 'AIでよくないですか', 50, 'points', 55),
  ('v1-056', 'パスワード忘れました', 10, 'points', 56),
  ('v1-057', 'なんとなく正解', 20, 'points', 57),
  ('v1-058', 'アルゴリズム体操', 30, 'points', 58),
  ('v1-059', 'ITは感覚だ', 50, 'points', 59),
  ('v1-060', '恋人は勉強', 100, 'points', 60),
  ('v1-061', '花形', 80, 'points', 61),
  ('v1-062', '金のなる木', 60, 'points', 62),
  ('v1-063', '問題児', 40, 'points', 63),
  ('v1-064', '負け犬', 20, 'points', 64),
  ('v1-065', 'ブルートフォースアタック', 50, 'points', 65),
  ('v1-066', '皆勤賞', 0, 'condition', 66)
) AS catalog(catalog_key, name, price_points, acquisition_kind, sort_order)
ON CONFLICT (name) DO UPDATE SET
  catalog_key = EXCLUDED.catalog_key,
  acquisition_kind = EXCLUDED.acquisition_kind,
  price_points = EXCLUDED.price_points,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
