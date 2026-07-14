"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Languages } from "lucide-react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import { generateBilingualAbstract } from "@/services/abstract";

interface AbstractBilingualButtonProps {
  project: ProjectData;
  onApply: (payload: { abstract: string; keywords: string }) => void;
}

/** 工作台摘要区：一键生成双语摘要并写回（主语言摘要 + 关键词） */
export function AbstractBilingualButton({ project, onApply }: AbstractBilingualButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const draftOrOutline = [
      project.abstract,
      project.outline,
      Object.values(project.sections || {}).join("\n\n"),
    ]
      .filter((s) => s?.trim())
      .join("\n\n");

    if (draftOrOutline.trim().length < 40) {
      toast.error("正文或大纲过短，无法生成摘要");
      return;
    }

    setLoading(true);
    try {
      const result = await generateBilingualAbstract({
        title: project.title || "未命名",
        draftOrOutline,
        language: project.language === "en" ? "en" : "zh",
        paperType: project.mode === "research" ? "research" : "review",
      });
      const preferEn = project.language === "en";
      const abstract = preferEn
        ? `${result.en}\n\n【中文摘要】\n${result.zh}`
        : `${result.zh}\n\n【English Abstract】\n${result.en}`;
      const keywords = preferEn
        ? result.keywordsEn.join("; ")
        : result.keywordsZh.join("；");
      onApply({ abstract, keywords });
      toast.success("已生成双语摘要");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-[11px]"
      disabled={loading}
      onClick={() => void handleClick()}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
      双语摘要
    </Button>
  );
}
