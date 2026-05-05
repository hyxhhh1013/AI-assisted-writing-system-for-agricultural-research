-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "authors" TEXT DEFAULT 'Lab Member',
    "affiliations" TEXT DEFAULT '农业科学研究中心，北京 100083',
    "abstract" TEXT DEFAULT '',
    "researchDirection" TEXT DEFAULT '',
    "outline" TEXT DEFAULT '',
    "template" TEXT NOT NULL DEFAULT 'sci',
    "lastUpdated" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL,
    CONSTRAINT "Section_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "Reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "AnalysisResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '未分类',
    "size" INTEGER NOT NULL,
    "mtime" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "fileId" TEXT NOT NULL,
    CONSTRAINT "KnowledgeChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "KnowledgeFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_projectId_key_key" ON "Section"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeFile_name_key" ON "KnowledgeFile"("name");
