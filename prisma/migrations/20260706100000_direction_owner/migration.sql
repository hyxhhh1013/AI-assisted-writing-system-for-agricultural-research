-- SEC-01: Direction 归属用户（每用户私有，与 Project 一致）
-- 兼容：若已通过 db push 写入 userId，则跳过重复 DDL

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Direction' AND column_name = 'userId'
  ) THEN
    ALTER TABLE "Direction" ADD COLUMN "userId" TEXT;
  END IF;
END $$;

UPDATE "Direction"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

ALTER TABLE "Direction" ALTER COLUMN "userId" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Direction_userId_fkey'
  ) THEN
    ALTER TABLE "Direction" ADD CONSTRAINT "Direction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Direction_userId_idx" ON "Direction"("userId");
