import type { Prisma } from "@prisma/client";
import type { AnalysisResultPatchOp } from "@/contracts/project";

/** 在项目事务内按 op 增量更新 AnalysisResult 行 */
export async function applyAnalysisResultPatchOps(
  tx: Prisma.TransactionClient,
  projectId: string,
  ops: AnalysisResultPatchOp[],
): Promise<void> {
  for (const op of ops) {
    if (op.op === "create") {
      await tx.analysisResult.create({
        data: { projectId, content: op.content },
      });
      continue;
    }

    if (op.op === "update") {
      const updated = await tx.analysisResult.updateMany({
        where: { id: op.id, projectId },
        data: { content: op.content },
      });
      if (updated.count === 0) {
        throw new Error(`分析结果不存在: ${op.id}`);
      }
      continue;
    }

    if (op.op === "delete") {
      const deleted = await tx.analysisResult.deleteMany({
        where: { id: op.id, projectId },
      });
      if (deleted.count === 0) {
        throw new Error(`分析结果不存在: ${op.id}`);
      }
    }
  }
}
