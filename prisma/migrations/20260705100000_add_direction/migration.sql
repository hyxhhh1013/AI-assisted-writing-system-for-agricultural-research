-- CreateTable: Direction（研究方向战略规划）
-- 注：userId 在下一迁移 20260706100000_direction_owner 中添加

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
