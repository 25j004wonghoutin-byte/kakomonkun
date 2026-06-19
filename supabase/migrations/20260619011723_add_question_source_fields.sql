ALTER TABLE "questions"
ADD COLUMN "source_key" VARCHAR(120),
ADD COLUMN "image_path" TEXT;

UPDATE "questions"
SET "source_key" = 'legacy-' || "id"::text
WHERE "source_key" IS NULL;

ALTER TABLE "questions"
ALTER COLUMN "source_key" SET NOT NULL;

CREATE UNIQUE INDEX "questions_source_key_key" ON "questions"("source_key");
