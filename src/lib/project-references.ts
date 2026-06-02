import type { Prisma } from "@prisma/client";
import type { ReferencePatchOp } from "@/contracts/project";

/** 在项目事务内按 op 增量更新 Reference 行（保持 order 连续） */
export async function applyReferencePatchOps(
  tx: Prisma.TransactionClient,
  projectId: string,
  ops: ReferencePatchOp[],
): Promise<void> {
  for (const op of ops) {
    if (op.op === "create") {
      const count = await tx.reference.count({ where: { projectId } });
      let index = op.index ?? count;
      if (index < 0) index = 0;
      if (index > count) index = count;

      await tx.reference.updateMany({
        where: { projectId, order: { gte: index } },
        data: { order: { increment: 1 } },
      });
      await tx.reference.create({
        data: { projectId, content: op.content, order: index },
      });
      continue;
    }

    if (op.op === "update") {
      const updated = await tx.reference.updateMany({
        where: { id: op.id, projectId },
        data: { content: op.content },
      });
      if (updated.count === 0) {
        throw new Error(`参考文献不存在: ${op.id}`);
      }
      continue;
    }

    if (op.op === "delete") {
      const ref = await tx.reference.findFirst({
        where: { id: op.id, projectId },
        select: { id: true, order: true },
      });
      if (!ref) {
        throw new Error(`参考文献不存在: ${op.id}`);
      }
      await tx.reference.delete({ where: { id: ref.id } });
      await tx.reference.updateMany({
        where: { projectId, order: { gt: ref.order } },
        data: { order: { decrement: 1 } },
      });
      continue;
    }

    if (op.op === "replace") {
      await tx.reference.deleteMany({ where: { projectId } });
      for (let i = 0; i < op.items.length; i++) {
        await tx.reference.create({
          data: { projectId, content: op.items[i], order: i },
        });
      }
    }
  }
}
