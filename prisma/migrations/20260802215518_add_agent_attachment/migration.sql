-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('extracting', 'ready', 'extract_failed', 'unsupported');

-- CreateTable
CREATE TABLE "AgentAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "projectId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "fileKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'extracting',
    "extractSource" TEXT,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentAttachment_userId_sessionId_idx" ON "AgentAttachment"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "AgentAttachment_userId_projectId_idx" ON "AgentAttachment"("userId", "projectId");

-- CreateIndex
CREATE INDEX "AgentAttachment_status_idx" ON "AgentAttachment"("status");

-- AddForeignKey
ALTER TABLE "AgentAttachment" ADD CONSTRAINT "AgentAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
