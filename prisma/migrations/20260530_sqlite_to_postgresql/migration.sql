-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authors" TEXT DEFAULT 'Lab Member',
    "affiliations" TEXT DEFAULT '农业科学研究中心，北京 100083',
    "abstract" TEXT DEFAULT '',
    "keywords" TEXT DEFAULT '',
    "classification" TEXT DEFAULT '',
    "researchDirection" TEXT DEFAULT '',
    "outline" TEXT DEFAULT '',
    "template" TEXT NOT NULL DEFAULT 'sci',
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT DEFAULT 'review',
    "charts" TEXT,
    "dataClaims" TEXT,
    "citationStyle" TEXT DEFAULT 'gbt7714',
    "dataSources" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '未分类',
    "documentType" TEXT NOT NULL DEFAULT 'paper',
    "size" INTEGER NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlagiarismCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "maxSimilarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallRisk" TEXT NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlagiarismCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlagiarismMatch" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceOffset" INTEGER NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchedText" TEXT NOT NULL,
    "matchedFrom" TEXT NOT NULL,
    "matchedUrl" TEXT,
    "similarity" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlagiarismMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewriteSuggestion" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "matchId" TEXT,
    "originalText" TEXT NOT NULL,
    "suggestedText" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewrittenSimilarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewriteSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "overallScore" DOUBLE PRECISION,
    "overallGrade" TEXT,
    "summary" TEXT,
    "synopsis" TEXT,
    "dimensions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewIssue" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "location" TEXT,
    "evidence" TEXT,
    "description" TEXT NOT NULL,
    "suggestion" TEXT,
    "originalText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fixedContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "refIndex" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_projectId_key_key" ON "Section"("projectId", "key");

-- CreateIndex
CREATE INDEX "Reference_projectId_order_idx" ON "Reference"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeFile_name_key" ON "KnowledgeFile"("name");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_fileId_idx" ON "KnowledgeChunk"("fileId");

-- CreateIndex
CREATE INDEX "PlagiarismCheck_projectId_idx" ON "PlagiarismCheck"("projectId");

-- CreateIndex
CREATE INDEX "PlagiarismMatch_checkId_idx" ON "PlagiarismMatch"("checkId");

-- CreateIndex
CREATE INDEX "RewriteSuggestion_checkId_idx" ON "RewriteSuggestion"("checkId");

-- CreateIndex
CREATE INDEX "ReviewCheck_projectId_idx" ON "ReviewCheck"("projectId");

-- CreateIndex
CREATE INDEX "ReviewCheck_createdAt_idx" ON "ReviewCheck"("createdAt");

-- CreateIndex
CREATE INDEX "ReviewIssue_checkId_idx" ON "ReviewIssue"("checkId");

-- CreateIndex
CREATE INDEX "ReviewIssue_dimension_idx" ON "ReviewIssue"("dimension");

-- CreateIndex
CREATE INDEX "ReviewIssue_severity_idx" ON "ReviewIssue"("severity");

-- CreateIndex
CREATE INDEX "ReferenceSource_projectId_idx" ON "ReferenceSource"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceSource_projectId_refIndex_key" ON "ReferenceSource"("projectId", "refIndex");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "KnowledgeFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlagiarismCheck" ADD CONSTRAINT "PlagiarismCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlagiarismMatch" ADD CONSTRAINT "PlagiarismMatch_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "PlagiarismCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewriteSuggestion" ADD CONSTRAINT "RewriteSuggestion_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "PlagiarismCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewriteSuggestion" ADD CONSTRAINT "RewriteSuggestion_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "PlagiarismMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewIssue" ADD CONSTRAINT "ReviewIssue_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ReviewCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceSource" ADD CONSTRAINT "ReferenceSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

