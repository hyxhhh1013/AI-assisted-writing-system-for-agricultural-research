import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingGlobalContext } from "@/app/api/writing/types";
import { hasCompletePaperConfig } from "@/lib/agent/config-qa";
import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import { rowsToSoftReferenceEvidence } from "@/lib/reference-evidence";
import prisma from "@/lib/prisma";

export interface AgentSectionFill {
  key: string;
  chars: number;
  /** 正文摘录，供 Agent 上下文（非全量） */
  preview?: string;
}

export interface AgentProjectSnapshot {
  title: string;
  mode: "review" | "research";
  language: "zh" | "en";
  template: string;
  citationStyle: "gbt7714" | "vancouver" | "apa7" | "ieee";
  researchDirection: string;
  outline: string;
  references: string[];
  /** 有摘要的项目文献（1-based），供写作 soft-grounded */
  referenceEvidence?: import("@/contracts/project").SoftReferenceEvidence[];
  dataClaims: EvidenceClaim[];
  globalContext?: WritingGlobalContext;
  /** Passport currentPhase 0–7 */
  currentPhase: number | null;
  hasWritingBlueprint: boolean;
  hasArgumentBlueprint: boolean;
  sectionFills: AgentSectionFill[];
  /** 写作蓝图短摘要（thesis / 词数） */
  writingBlueprintSummary?: string | null;
  /** 论证蓝图短摘要 */
  argumentBlueprintSummary?: string | null;
  /** Passport 是否已有 config 记录 */
  hasPaperConfig: boolean;
  /** 写作入口（新建项目选定） */
  agentEntryMode?: import("@/contracts/paper-passport").AgentEntryModeId | null;
}

export async function loadAgentProject(
  userId: string,
  projectId: string,
): Promise<AgentProjectSnapshot | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      references: { orderBy: { order: "asc" } },
      sections: true,
    },
  });
  if (!project) return null;

  let dataClaims: EvidenceClaim[] = [];
  if (project.dataClaims) {
    try {
      const parsed = JSON.parse(project.dataClaims) as unknown;
      if (Array.isArray(parsed)) {
        dataClaims = parsed as EvidenceClaim[];
      }
    } catch {
      dataClaims = [];
    }
  }

  const writingBlueprint = await readWritingBlueprint(projectId);
  let globalContext: WritingGlobalContext | undefined;
  if (writingBlueprint) {
    try {
      globalContext = JSON.parse(writingBlueprint) as WritingGlobalContext;
    } catch {
      globalContext = undefined;
    }
  }

  const langRaw = (project as { language?: string | null }).language;
  const styleRaw = project.citationStyle;

  let currentPhase: number | null = null;
  let hasPaperConfig = false;
  let agentEntryMode: import("@/contracts/paper-passport").AgentEntryModeId | null = null;
  if (project.paperPassport) {
    try {
      const parsed = JSON.parse(project.paperPassport) as {
        currentPhase?: unknown;
        config?: {
          agentEntryMode?: unknown;
        };
      };
      if (typeof parsed.currentPhase === "number") {
        currentPhase = parsed.currentPhase;
      }
      // 须有题目等完整字段；空壳 config 仍要走问答
      hasPaperConfig = hasCompletePaperConfig(parsed.config);
      const em = parsed.config?.agentEntryMode;
      if (em === "full" || em === "outline_ready" || em === "data_ready") {
        agentEntryMode = em;
      }
    } catch {
      currentPhase = null;
      hasPaperConfig = false;
      agentEntryMode = null;
    }
  }

  const sectionFills = project.sections.map((s) => {
    const content = s.content ?? "";
    return {
      key: s.key,
      chars: content.replace(/\s+/g, "").length,
      preview: content.trim() ? content.trim().slice(0, 280) : undefined,
    };
  });
  // 摘要存于 Project.abstract 列（不在 sections 表），单独纳入统计，
  // 否则 inspect_project / draftCoverage 永远误报摘要空白
  const abstractText = (project.abstract ?? "").trim();
  sectionFills.push({
    key: "abstract",
    chars: abstractText.replace(/\s+/g, "").length,
    preview: abstractText ? abstractText.slice(0, 280) : undefined,
  });

  let writingBlueprintSummary: string | null = null;
  if (writingBlueprint?.trim()) {
    try {
      const bp = JSON.parse(writingBlueprint) as {
        thesis?: string;
        estimatedWordCount?: { min?: number; max?: number };
      };
      const words =
        bp.estimatedWordCount?.min != null && bp.estimatedWordCount?.max != null
          ? `词数约 ${bp.estimatedWordCount.min}-${bp.estimatedWordCount.max}`
          : "";
      writingBlueprintSummary = [bp.thesis?.slice(0, 200), words]
        .filter(Boolean)
        .join("；") || "（已有写作蓝图）";
    } catch {
      writingBlueprintSummary = "（已有写作蓝图）";
    }
  }

  let argumentBlueprintSummary: string | null = null;
  if (project.argumentBlueprint?.trim()) {
    try {
      const ab = JSON.parse(project.argumentBlueprint) as {
        centralThesis?: string;
        chains?: unknown[];
      };
      argumentBlueprintSummary = [
        ab.centralThesis?.slice(0, 200),
        Array.isArray(ab.chains) ? `链条 ${ab.chains.length} 条` : "",
      ]
        .filter(Boolean)
        .join("；") || "（已有论证蓝图）";
    } catch {
      argumentBlueprintSummary = "（已有论证蓝图）";
    }
  }

  return {
    title: project.title,
    mode: project.mode === "research" ? "research" : "review",
    language: langRaw === "en" ? "en" : "zh",
    template: project.template || "sci",
    citationStyle:
      styleRaw === "vancouver" || styleRaw === "apa7" || styleRaw === "ieee"
        ? styleRaw
        : "gbt7714",
    researchDirection: project.researchDirection || "",
    outline: project.outline || "",
    references: project.references.map((r) => r.content),
    referenceEvidence: rowsToSoftReferenceEvidence(project.references),
    dataClaims,
    globalContext,
    currentPhase,
    hasWritingBlueprint: Boolean(writingBlueprint?.trim()),
    hasArgumentBlueprint: Boolean(project.argumentBlueprint?.trim()),
    sectionFills,
    writingBlueprintSummary,
    argumentBlueprintSummary,
    hasPaperConfig,
    agentEntryMode,
  };
}
