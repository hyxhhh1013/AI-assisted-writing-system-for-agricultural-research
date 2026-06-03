"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Copy, Database, ScrollText, Link2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/shared/previews/shared";
import { WritingSseStatus } from "@/components/shared/writing/writing-sse-status";
import type { PipelineStep } from "@/hooks/use-writing-stream";
import type {
  CitationWarning,
  DataClaimWarning,
  GenerationStatus,
} from "@/components/shared/writing/writing-types";

export interface WritingExpandResultProps {
  result: string;
  generationStatus: GenerationStatus;
  citationWarnings: CitationWarning[];
  dataClaimWarnings: DataClaimWarning[];
  lastRefMapping: Record<string, number> | null;
  detectedRefs: string[];
  verificationFeedback: string;
  pipelineSteps: PipelineStep[];
  onApplyToEditor: () => void;
}

/** 无 onPreviewUpdate 时侧边栏内展示扩写结果与核查信息 */
export function WritingExpandResult({
  result,
  generationStatus,
  citationWarnings,
  dataClaimWarnings,
  lastRefMapping,
  detectedRefs,
  verificationFeedback,
  pipelineSteps,
  onApplyToEditor,
}: WritingExpandResultProps) {
  const [refMappingExpanded, setRefMappingExpanded] = useState(false);

  return (
    <Card className="flex flex-col min-h-[300px] bg-primary/5 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between py-3 border-b">
        <CardTitle className="text-sm font-bold">AI 生成内容</CardTitle>
        <div className="flex gap-1">
          <Button
            variant="default"
            size="sm"
            className="h-7 text-[10px]"
            onClick={onApplyToEditor}
            disabled={generationStatus === "generating_figures"}
          >
            {generationStatus === "generating_figures" ? "配图生成中..." : "应用到编辑器"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              navigator.clipboard.writeText(result);
              toast.success("已复制");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-4 space-y-4">
        {citationWarnings.length > 0 && (
          <div className="bg-red-50 p-3 rounded-md border border-red-200 mb-2">
            <div className="text-[10px] font-bold text-red-700 mb-1 flex items-center gap-1 uppercase">
              <ScrollText className="h-3 w-3" /> 引用真实性警告
            </div>
            <p className="text-[9px] text-red-600 mb-2">
              以下引用在文献库中未找到足够的文本依据，可能为模型虚构。建议人工核实：
            </p>
            <ul className="space-y-1">
              {citationWarnings.map((w, i) => (
                <li key={i} className="text-[9px] text-red-700 bg-red-100/50 p-1.5 rounded">
                  <span className="font-bold">[{w.num}]</span> 重叠度 {w.overlap}%
                  <span className="block text-red-500 truncate mt-0.5">&ldquo;{w.context}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dataClaimWarnings.length > 0 && (
          <div className="bg-orange-50 p-3 rounded-md border border-orange-200 mb-2">
            <div className="text-[10px] font-bold text-orange-700 mb-1 flex items-center gap-1 uppercase">
              <Database className="h-3 w-3" /> 数据证据核查警告
            </div>
            <p className="text-[9px] text-orange-600 mb-2">
              以下数据证据声明在生成文本中未正确引用或数值不一致：
            </p>
            <ul className="space-y-1">
              {dataClaimWarnings.map((w, i) => (
                <li key={i} className="text-[9px] text-orange-700 bg-orange-100/50 p-1.5 rounded">
                  <span className="font-bold">[{w.claimId}]</span>{" "}
                  {!w.found ? "未引用" : "数值不一致"}
                  <span className="block text-orange-500 truncate mt-0.5">
                    {w.claimText}
                    {w.issue && <span className="block text-red-500">{w.issue}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lastRefMapping && Object.keys(lastRefMapping).length > 0 && (
          <div className="bg-background/50 p-2 rounded-md border border-dashed border-blue-300/50">
            <button
              type="button"
              className="w-full text-left text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1 uppercase"
              onClick={() => setRefMappingExpanded((v) => !v)}
            >
              <Link2 className="h-3 w-3" />
              本次新增 {Object.keys(lastRefMapping).length} 条文献映射
              {refMappingExpanded ? (
                <ChevronDown className="h-3 w-3 ml-auto" />
              ) : (
                <ChevronRight className="h-3 w-3 ml-auto" />
              )}
            </button>
            {refMappingExpanded && (
              <ul className="text-[9px] text-muted-foreground space-y-1 mt-1">
                {Object.entries(lastRefMapping)
                  .sort(([, a], [, b]) => a - b)
                  .map(([sourceName, refIndex]) => (
                    <li key={sourceName} className="truncate">
                      <span className="font-mono text-primary">[{refIndex}]</span> {sourceName}
                    </li>
                  ))}
              </ul>
            )}
            <p className="text-[9px] text-muted-foreground/70 mt-1.5">
              可在左侧「参考文献 → 引用溯源」查看并打开 PDF
            </p>
          </div>
        )}

        {detectedRefs.length > 0 && (
          <div className="bg-background/50 p-2 rounded-md border border-dashed border-primary/30">
            <div className="text-[10px] font-bold text-primary mb-1 flex items-center gap-1 uppercase">
              <Database className="h-3 w-3" /> 自动引用的文献:
            </div>
            <ul className="text-[9px] text-muted-foreground list-decimal list-inside">
              {detectedRefs.map((ref, i) => (
                <li key={i} className="truncate">
                  {ref}
                </li>
              ))}
            </ul>
          </div>
        )}

        <WritingSseStatus steps={pipelineSteps} />

        {verificationFeedback && (
          <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
            <div className="text-[10px] font-bold mb-1 flex items-center gap-1 uppercase">
              <ScrollText className="h-3 w-3" /> 学术核查意见:
            </div>
            <div className="text-[10px] whitespace-pre-wrap italic leading-relaxed">
              {verificationFeedback}
            </div>
          </div>
        )}

        <div className="leading-relaxed text-[11px]">
          <MarkdownContent content={result} />
        </div>
      </CardContent>
    </Card>
  );
}
