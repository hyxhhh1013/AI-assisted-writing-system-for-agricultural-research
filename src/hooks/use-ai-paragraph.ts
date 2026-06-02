"use client";

import { useCallback } from "react";
import type { ProjectData } from "@/contracts/project";
import type { WritingRequest } from "@/contracts/writing";
import { postWritingStream } from "@/services/writing";

type AiMode = "expand" | "audit" | "fix";

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

    const body: WritingRequest = {
      title: project.title,
      section: activeSection,
      context: paragraphContent,
      language: "zh",
      template: project.template,
      existingReferences: project.references || [],
      researchDirection: project.researchDirection,
    };

    if (mode === "audit") body.mode = "audit_only";
    if (mode === "fix") {
      body.mode = "fix_only";
      body.verificationFeedback = feedback;
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
            if (data.type === "references" && mode === "expand") {
              setProject(prev => ({
                ...prev,
                references: Array.from(new Set([...(prev.references || []), ...(data.references as string[])])),
              }));
            } else if (data.type === "delta" && (mode === "expand" || mode === "fix")) {
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
