import { Prisma } from "@prisma/client";
import type { ReferencePatchOp } from "@/contracts/project";

const REF_LOCK_PREFIX = "refs:";

/** 同项目参考文献 PATCH 串行化（事务级 advisory lock） */
export async function lockProjectReferences(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REF_LOCK_PREFIX + projectId}))`;
}

export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** 按 order 排序后重排为 0..n-1（dedup 脚本与单测复用） */
export function renumberReferencesInOrder<T extends { id: string; order: number }>(
  refs: T[],
): Array<T & { order: number }> {
  return refs
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((ref, index) => ({ ...ref, order: index }));
}

async function createReferenceAt(
  tx: Prisma.TransactionClient,
  projectId: string,
  content: string,
  preferredIndex: number,
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const count = await tx.reference.count({ where: { projectId } });
      let index = preferredIndex ?? count;
      if (index < 0) index = 0;
      if (index > count) index = count;

      await tx.reference.updateMany({
        where: { projectId, order: { gte: index } },
        data: { order: { increment: 1 } },
      });
      await tx.reference.create({
        data: { projectId, content, order: index },
      });
      return;
    } catch (error: unknown) {
      if (isPrismaUniqueViolation(error) && attempt < maxAttempts - 1) {
        continue;
      }
      throw error;
    }
  }
}

/** 在项目事务内按 op 增量更新 Reference 行（保持 order 连续） */
export async function applyReferencePatchOps(
  tx: Prisma.TransactionClient,
  projectId: string,
  ops: ReferencePatchOp[],
): Promise<void> {
  await lockProjectReferences(tx, projectId);

  for (const op of ops) {
    if (op.op === "create") {
      const count = await tx.reference.count({ where: { projectId } });
      const index = op.index ?? count;
      await createReferenceAt(tx, projectId, op.content, index);
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
