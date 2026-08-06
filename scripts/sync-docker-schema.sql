-- One-time sync: Docker grainscript-db (legacy db push) → current Prisma schema
-- Safe to re-run (idempotent)

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'zh';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "writingBlueprint" TEXT;

CREATE TABLE IF NOT EXISTS "Direction" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "assets" JSONB,
    "analysis" JSONB,
    "roadmap" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Direction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Direction_slug_key" ON "Direction"("slug");
CREATE INDEX IF NOT EXISTS "Direction_status_idx" ON "Direction"("status");

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

ALTER TABLE "Direction" ALTER COLUMN "categories" DROP DEFAULT;

ALTER TABLE "KnowledgeFile" ALTER COLUMN "mtime" DROP NOT NULL;
