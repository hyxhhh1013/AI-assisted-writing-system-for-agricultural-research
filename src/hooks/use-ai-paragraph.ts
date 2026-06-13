"use client";

import { useCallback } from "react";
import type { ProjectData } from "@/contracts/project";
import { MIN_DRAFT_CHARS_SHORT, type WritingRequest } from "@/contracts/writing";
import { postWritingStream } from "@/services/writing";

type AiMode = "expand" | "audit" | "fix" | "polish" | "shorten";

export type AiParagraphAction = AiMode;

const AI_TASK_PREFIX: Partial<Record<AiMode, string>> = {
  polish: "【任务】在不改变学术事实与引用编号的前提下润色以下段落，使其更流畅、术语更规范：\n\n",
  shorten: "【任务】在保留核心论点与引用编号的前提下精简以下段落：\n\n",
};

interface UseAiParagraphOptions {
  project: ProjectData;
  activeSection: string;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
}

/**
 * AI 段落操作 hook — 统一扩写/审查/修正的 SSE 流处理。
 * 替代 workbench/page.tsx 中三个几乎相同的 handler。
 */
export function useAiParagraph({ project, activeSection, setProject }: UseAiParagraphOptions) {
  const run = useCallback(async (
    mode: AiMode,
    paragraphContent: string,
    feedback?: string,
  ): Promise<string> => {
    if (!project || !activeSection) return "";

    const trimmed = paragraphContent.trim();
    if (mode !== "audit" && mode !== "fix" && trimmed.length < MIN_DRAFT_CHARS_SHORT) {
      throw new Error(`请至少输入 ${MIN_DRAFT_CHARS_SHORT} 字后再使用 AI 扩写`);
    }
    if ((mode === "audit" || mode === "fix") && !trimmed) {
      throw new Error("请先选中或输入待处理段落");
    }

    const taskPrefix = AI_TASK_PREFIX[mode] ?? "";
    const body: WritingRequest = {
      title: project.title,
      section: activeSection,
      context: `${taskPrefix}${paragraphContent}`,
      language: "zh",
      template: project.template,
      existingReferences: project.references || [],
      researchDirection: project.researchDirection,
      projectMode: project.mode || "review",
    };

    if (mode === "audit") body.mode = "audit_only";
    else if (mode === "fix") {
      body.mode = "fix_only";
      body.verificationFeedback = feedback;
    } else {
      body.mode = "fast";
    }

    const response = await postWritingStream(body);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let buffer = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data:")) continue;
          try {
            const data = JSON.parse(trimmed.slice(5));
            if (data.type === "references" && mode !== "audit") {
              setProject(prev => ({
                ...prev,
                references: Array.from(new Set([...(prev.references || []), ...(data.references as string[])])),
              }));
            } else if (data.type === "delta" && mode !== "audit") {
              result += data.content as string;
            } else if (data.type === "verification" && mode === "audit") {
              result += data.verification as string;
            }
          } catch { /* skip malformed */ }
        }
      }
    }

    return result;
  }, [project, activeSection, setProject]);

  return { run };
}
