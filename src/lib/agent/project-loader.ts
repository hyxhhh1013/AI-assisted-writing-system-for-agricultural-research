import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingGlobalContext } from "@/app/api/writing/types";
import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import prisma from "@/lib/prisma";

export interface AgentSectionFill {
  key: string;
  chars: number;
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
  dataClaims: EvidenceClaim[];
  globalContext?: WritingGlobalContext;
  /** Passport currentPhase 0–7 */
  currentPhase: number | null;
  hasWritingBlueprint: boolean;
  hasArgumentBlueprint: boolean;
  sectionFills: AgentSectionFill[];
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
  if (project.paperPassport) {
    try {
      const parsed = JSON.parse(project.paperPassport) as { currentPhase?: unknown };
      if (typeof parsed.currentPhase === "number") {
        currentPhase = parsed.currentPhase;
      }
    } catch {
      currentPhase = null;
    }
  }

  const sectionFills = project.sections.map((s) => ({
    key: s.key,
    chars: s.content?.replace(/\s+/g, "").length ?? 0,
  }));

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
    dataClaims,
    globalContext,
    currentPhase,
    hasWritingBlueprint: Boolean(writingBlueprint?.trim()),
    hasArgumentBlueprint: Boolean(project.argumentBlueprint?.trim()),
    sectionFills,
  };
}
