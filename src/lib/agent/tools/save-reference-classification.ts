import prisma from "@/lib/prisma";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

interface ClassificationInput {
  refIndex: number;
  sourceName: string;
  category: string;
  citation?: string;
}

/**
 * 「文献分类编码」持久化：把每个引用编号 [n] 映射到知识库源文件与分类，
 * 写入 ReferenceSource（与前端「引用-文献映射」同一张表）。
 * 引导 Agent：先用一次 list_references 拿到全量文献，再一次性提交分类，避免多次重复检索。
 */
export const saveReferenceClassificationTool: ToolDefinition = {
  name: "save_reference_classification",
  description:
    "将「文献分类编码」结果持久化到项目：为每个引用编号 [n] 保存 sourceName（知识库源文件名）与 category（文献分类）。"
    + "用户在写作前要求「分类编码」「给文献分类」时调用。"
    + "用法：先 list_references 一次拿到全量文献（含编号与来源），再一次性调用本工具提交全部分类，"
    + "不要多次反复检索同一个库。refIndex 为引用编号（1 起，对应参考文献 [n]）。"
    + "sourceName 填对应知识库 PDF 文件名；外部导入无 PDF 的可填引用标题或 DOI 标识。",
  parameters: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        description:
          "分类映射列表，每项形如 {\"refIndex\": 1, \"sourceName\": \"xxx.pdf\", \"category\": \"热解\", \"citation\": \"...\"}。"
          + "一次提交全部，勿拆多条工具调用。refIndex 1 起对应 [n]；sourceName 填知识库源文件名（外部导入无 PDF 用标题/DOI 标识）。",
      },
    },
    required: ["classifications"],
  },
  safety: "write",
  async execute(params: Record<string, unknown>, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "save_reference_classification 需要关联 projectId" };
    }
    const raw = params.classifications;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { success: false, error: "classifications 不能为空" };
    }
    if (raw.length > 200) {
      return { success: false, error: "一次最多提交 200 条分类" };
    }

    const cleaned: ClassificationInput[] = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (!c || typeof c !== "object") {
        return { success: false, error: `classifications[${i}] 必须是对象` };
      }
      const refIndex = Number((c as { refIndex?: unknown }).refIndex);
      if (!Number.isInteger(refIndex) || refIndex < 1) {
        return { success: false, error: `classifications[${i}].refIndex 必须为正整数（1 起）` };
      }
      const sourceName = String((c as { sourceName?: unknown }).sourceName ?? "").trim();
      if (!sourceName && !(c as { category?: unknown }).category?.toString().trim()) {
        return { success: false, error: `classifications[${i}] 至少提供 category 或 sourceName` };
      }
      cleaned.push({
        refIndex,
        sourceName,
        category: String((c as { category?: unknown }).category ?? "").trim(),
        citation: (c as { citation?: unknown }).citation
          ? String((c as { citation?: unknown }).citation)
          : "",
      });
    }

    try {
      for (const m of cleaned) {
        // sourceName 可省略：用对应引用的题录/标题兜底
        let sourceName = m.sourceName;
        if (!sourceName) {
          const ref = await prisma.reference.findFirst({
            where: { projectId: ctx.projectId, order: m.refIndex - 1 },
            select: { title: true, content: true },
          });
          sourceName = (ref?.title?.trim() || ref?.content?.trim() || `[${m.refIndex}]`)
            .slice(0, 200);
        }
        await prisma.referenceSource.upsert({
          where: {
            projectId_refIndex: { projectId: ctx.projectId, refIndex: m.refIndex },
          },
          update: {
            sourceName,
            category: m.category,
            citation: m.citation || undefined,
          },
          create: {
            projectId: ctx.projectId,
            refIndex: m.refIndex,
            sourceName,
            category: m.category,
            citation: m.citation || "",
          },
        });
      }
      const categories = [...new Set(cleaned.map((m) => m.category).filter(Boolean))];
      return {
        success: true,
        summary:
          `已保存 ${cleaned.length} 条文献分类映射`
          + (categories.length > 0 ? `（分类：${categories.slice(0, 6).join("、")}${categories.length > 6 ? "…" : ""}）` : ""),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `保存文献分类失败：${message}` };
    }
  },
};
