import { evaluateCitationGate } from "@/lib/citation-gate";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { parseProjectCharts } from "@/contracts/figure";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

const SECTION_ORDER = [
  "abstract",
  "introduction",
  "background",
  "literature_body",
  "methods",
  "results",
  "discussion",
  "conclusion",
] as const;

const SECTION_TITLE: Record<string, string> = {
  abstract: "摘要",
  introduction: "引言",
  background: "背景",
  literature_body: "文献综述",
  methods: "方法",
  results: "结果",
  discussion: "讨论",
  conclusion: "结论",
};

/**
 * 轻量「formatter」：打包 Markdown 手稿 + 引用就绪检查（非 DOCX/PDF 二进制）。
 */
export const exportManuscriptMarkdownTool: ToolDefinition = {
  name: "export_manuscript_markdown",
  description:
    "导出当前项目手稿为 Markdown 打包文本，并给出引用就绪检查。用于交付前汇总；正式 PDF 仍走导出接口",
  parameters: {
    type: "object",
    properties: {
      includeReferences: {
        type: "string",
        description: "是否附参考文献列表（默认 true）",
      },
      maxSectionChars: {
        type: "number",
        description: "单节最大字符，默认 20000，上限 40000",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "export_manuscript_markdown 需要绑定 projectId" };
    }

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      include: {
        sections: true,
        references: { orderBy: { order: "asc" } },
      },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const includeRefs =
      params.includeReferences === undefined
      || params.includeReferences === true
      || params.includeReferences === "true"
      || params.includeReferences === "1";
    const maxChars = Math.min(
      Math.max(Number(params.maxSectionChars) || 20_000, 1000),
      40_000,
    );

    const sectionMap = new Map(
      project.sections.map((s) => [s.key, s.content ?? ""]),
    );
    const parts: string[] = [
      `# ${project.title}`,
      "",
      `> 语言：${project.language ?? "zh"}　引用：${project.citationStyle ?? "gbt7714"}　类型：${project.mode ?? "research"}`,
      "",
    ];

    const abstract = project.abstract?.trim() || sectionMap.get("abstract")?.trim() || "";
    if (abstract) {
      parts.push("## 摘要", "", clip(abstract, maxChars), "");
    }

    for (const key of SECTION_ORDER) {
      if (key === "abstract") continue;
      const content = sectionMap.get(key)?.trim() ?? "";
      if (!content) continue;
      parts.push(`## ${SECTION_TITLE[key] ?? key}`, "", clip(content, maxChars), "");
    }

    if (includeRefs && project.references.length > 0) {
      parts.push("## 参考文献", "");
      project.references.forEach((r, i) => {
        parts.push(`[${i + 1}] ${(r.content ?? "").replace(/\s+/g, " ").trim()}`);
      });
      parts.push("");
    }

    const markdown = parts.join("\n");
    const texts = [
      project.abstract ?? "",
      ...project.sections.map((s) => s.content ?? ""),
    ];
    const gate = evaluateCitationGate({
      texts,
      refCount: project.references.length,
    });
    const passport = parsePaperPassport(project.paperPassport);
    const chartCount = parseProjectCharts(project.charts).length;

    return {
      success: true,
      data: {
        title: project.title,
        markdown,
        charCount: markdown.length,
        exportReady: gate.exportReady,
        citationGate: {
          passed: gate.passed,
          exportReady: gate.exportReady,
          outOfBounds: gate.outOfBounds,
          refCount: gate.refCount,
          hint: gate.hint,
        },
        chartCount,
        phase: passport?.currentPhase ?? null,
      },
      summary: gate.exportReady
        ? `已打包 Markdown 手稿（${markdown.length} 字符），引用检查通过`
        : `已打包 Markdown（${markdown.length} 字符）；${gate.hint}`,
    };
  },
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…[本节已截断]`;
}
