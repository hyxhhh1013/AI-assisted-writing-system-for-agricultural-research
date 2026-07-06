-- SEC-03: Reference (projectId, order) 唯一约束
-- 运行前请执行: node scripts/dedup-reference-order.mjs

CREATE UNIQUE INDEX IF NOT EXISTS "Reference_projectId_order_key" ON "Reference"("projectId", "order");
