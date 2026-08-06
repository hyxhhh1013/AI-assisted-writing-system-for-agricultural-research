-- AlterTable
ALTER TABLE "Direction" ALTER COLUMN "categories" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KnowledgeFile" ADD COLUMN     "bib" TEXT,
ADD COLUMN     "bibEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chunkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gbTag" TEXT,
ADD COLUMN     "metrics" TEXT,
ADD COLUMN     "parseWarning" TEXT,
ALTER COLUMN "mtime" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "writingBlueprint" TEXT;

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
