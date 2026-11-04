-- 個人ごとの公開プロフィールのバナー色。既存利用者には従来の色を使用する。
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS banner_color varchar(7) NOT NULL DEFAULT '#deece6';
