import prisma from "@/lib/prisma";
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
    + "若用户认为某文献离题、误导入，或准备换一批更相关的，可用本工具清理。"
    + "属破坏性操作，执行前会请用户确认。",
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
  safety: "destructive",
  requiresConfirmation: true,
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
        });
        const deletedSet = new Set(unique);
        const kept = refs.filter((r) => !deletedSet.has(r.order + 1));
        const toDeleteCount = refs.length - kept.length;
        if (toDeleteCount === 0) {
          return { deleted: 0 };
        }

        // 删全部 + 重建保留下来的行（重排 order、保留元数据）。
        // 不用 applyReferencePatchOps 的逐条 delete+decrement：批量删除相邻引用会撞 @@unique([projectId, order])
        await tx.reference.deleteMany({ where: { projectId: ctx.projectId! } });
        for (let i = 0; i < kept.length; i++) {
          const r = kept[i]!;
          await tx.reference.create({
            data: {
              projectId: ctx.projectId!,
              content: r.content,
              order: i,
              doi: r.doi ?? undefined,
              title: r.title ?? undefined,
              abstract: r.abstract ?? undefined,
              openAccessUrl: r.openAccessUrl ?? undefined,
              externalId: r.externalId ?? undefined,
              externalSource: r.externalSource ?? undefined,
            },
          });
        }

        // 清理/重排 ReferenceSource 分类映射（refIndex 1 基，与 [n] 对齐）
        const sources = await tx.referenceSource.findMany({
          where: { projectId: ctx.projectId! },
        });
        await tx.referenceSource.deleteMany({ where: { projectId: ctx.projectId! } });
        for (const s of sources) {
          if (deletedSet.has(s.refIndex)) continue;
          const shift = [...deletedSet].filter((d) => d < s.refIndex).length;
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
        return { deleted: toDeleteCount };
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
