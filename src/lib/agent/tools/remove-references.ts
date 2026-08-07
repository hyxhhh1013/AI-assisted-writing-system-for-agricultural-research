import prisma from "@/lib/prisma";
import { applyReferencePatchOps } from "@/lib/project-references";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 删除不相关 / 误导入的参考文献。
 * - indices 为引用编号（1 起，对应 [n]）
 * - 删除后自动重排后续编号；同步清理/重排 ReferenceSource 分类映射
 * - 若正文已引用这些编号，删除后需 validate_citations 检查越界引用
 */
export const removeReferencesTool: ToolDefinition = {
  name: "remove_references",
  description:
    "删除项目参考文献中不相关 / 误导入的条目。参数 indices 为引用编号数组（1 起，对应 [n]）。"
    + "删除后自动重排后续编号，并清理对应分类映射。"
    + "若正文已引用这些编号，删除后必须 validate_citations 检查越界引用；"
    + "若用户认为某文献离题、误导入，或准备换一批更相关的，可用本工具清理。",
  parameters: {
    type: "object",
    properties: {
      indices: {
        type: "array",
        description: "要删除的引用编号数组（1 起，对应 [n]），如 [3, 7, 12]",
      },
      reason: {
        type: "string",
        description: "删除原因（为什么这些不相关 / 误导入）",
      },
    },
    required: ["indices"],
  },
  safety: "write",
  async execute(params: Record<string, unknown>, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "remove_references 需要关联 projectId" };
    }
    const raw = params.indices;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { success: false, error: "indices 不能为空" };
    }
    if (raw.length > 100) {
      return { success: false, error: "一次最多删除 100 条" };
    }
    const indices: number[] = [];
    for (const v of raw) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) {
        return { success: false, error: `indices 必须为正整数（1 起），收到：${v}` };
      }
      indices.push(n);
    }
    const unique = [...new Set(indices)].sort((a, b) => a - b);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const refs = await tx.reference.findMany({
          where: { projectId: ctx.projectId! },
          orderBy: { order: "asc" },
          select: { id: true, order: true },
        });
        const byIndex = new Map(refs.map((r) => [r.order + 1, r]));
        const toDelete = unique.filter((i) => byIndex.has(i));
        if (toDelete.length === 0) {
          return { deleted: 0 };
        }

        // 删除引用 + 自动重排后续 order
        const deleteOps = toDelete.map((i) => ({
          op: "delete" as const,
          id: byIndex.get(i)!.id,
        }));
        await applyReferencePatchOps(tx, ctx.projectId!, deleteOps);

        // 清理/重排 ReferenceSource 分类映射（refIndex 1 基，与 [n] 对齐）
        const deletedSet = new Set(toDelete);
        const sources = await tx.referenceSource.findMany({
          where: { projectId: ctx.projectId! },
        });
        await tx.referenceSource.deleteMany({ where: { projectId: ctx.projectId! } });
        for (const s of sources) {
          if (deletedSet.has(s.refIndex)) continue;
          const shift = toDelete.filter((d) => d < s.refIndex).length;
          await tx.referenceSource.create({
            data: {
              projectId: ctx.projectId!,
              refIndex: s.refIndex - shift,
              sourceName: s.sourceName,
              category: s.category,
              citation: s.citation,
            },
          });
        }

        await tx.project.update({
          where: { id: ctx.projectId! },
          data: { lastUpdated: new Date() },
        });
        return { deleted: toDelete.length };
      });

      const remaining = await prisma.reference.count({
        where: { projectId: ctx.projectId },
      });
      return {
        success: true,
        summary:
          result.deleted > 0
            ? `已删除 ${result.deleted} 条不相关文献，参考文献现共 ${remaining} 条（编号已自动重排）`
            : "没有找到对应编号的文献（可能已被删除）",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `删除文献失败：${message}` };
    }
  },
};
