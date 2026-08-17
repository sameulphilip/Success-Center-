ALTER TABLE "OnlineOffer" ADD COLUMN IF NOT EXISTS "centerAmount" DECIMAL(12,2);
UPDATE "OnlineOffer"
SET "centerAmount" = ROUND(("price" * (1 - "teacherPercent" / 100.0))::numeric, 2)
WHERE "centerAmount" IS NULL;

ALTER TABLE "HandoutProduct" ADD COLUMN IF NOT EXISTS "centerAmount" DECIMAL(12,2);
UPDATE "HandoutProduct"
SET "centerAmount" = ROUND(("price" * (1 - "teacherPercent" / 100.0))::numeric, 2)
WHERE "centerAmount" IS NULL;
