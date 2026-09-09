INSERT INTO "titles" (
    "name",
    "description",
    "price_points",
    "rarity",
    "is_active",
    "sort_order",
    "updated_at"
) VALUES (
    '駆け出しのエンジニア',
    '学習を始めた学生の初期称号',
    0,
    'normal',
    true,
    0,
    now()
)
ON CONFLICT ("name") DO UPDATE SET
    "price_points" = EXCLUDED."price_points",
    "is_active" = EXCLUDED."is_active",
    "sort_order" = EXCLUDED."sort_order",
    "updated_at" = now();

INSERT INTO "user_titles" (
    "user_id",
    "title_id",
    "equipped_at"
)
SELECT
    sp."user_id",
    starter."id",
    CASE WHEN sp."current_title_id" IS NULL THEN now() ELSE NULL END
FROM "student_profiles" AS sp
CROSS JOIN "titles" AS starter
WHERE starter."name" = '駆け出しのエンジニア'
  AND sp."current_title_id" IS NULL
ON CONFLICT ("user_id", "title_id") DO NOTHING;

UPDATE "student_profiles" AS sp
SET "current_title_id" = starter."id",
    "updated_at" = now()
FROM "titles" AS starter
WHERE starter."name" = '駆け出しのエンジニア'
  AND sp."current_title_id" IS NULL;

UPDATE "user_titles" AS owned
SET "equipped_at" = COALESCE(owned."equipped_at", now())
FROM "student_profiles" AS sp,
     "titles" AS starter
WHERE starter."name" = '駆け出しのエンジニア'
  AND sp."current_title_id" = starter."id"
  AND owned."user_id" = sp."user_id"
  AND owned."title_id" = starter."id"
  AND owned."equipped_at" IS NULL;
