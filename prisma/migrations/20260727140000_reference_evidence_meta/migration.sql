-- AlterTable
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "doi" TEXT;
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "abstract" TEXT;
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "openAccessUrl" TEXT;
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Reference" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reference_projectId_doi_idx" ON "Reference"("projectId", "doi");
