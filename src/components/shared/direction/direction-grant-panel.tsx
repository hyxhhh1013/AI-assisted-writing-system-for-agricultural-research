"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Loader2,
  Download,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import { generateGrantProposal, type GrantProposalResult } from "@/services/direction";
import type { DirectionDTO, GrantProposalSnapshot } from "@/contracts/direction";

const GRANT_TYPES = ["国自然面上", "国自然青年", "省基金", "开放课题"] as const;
type GrantType = (typeof GRANT_TYPES)[number];

interface DirectionGrantPanelProps {
  slug: string;
  direction: DirectionDTO;
  onGenerated?: () => void;
}

export function DirectionGrantPanel({ slug, direction, onGenerated }: DirectionGrantPanelProps) {
  const [grantType, setGrantType] = useState<GrantType>("国自然面上");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<GrantProposalResult | null>(null);

  const analysis = direction.analysis;
  const hasAnalysis = !!(analysis?.dimensions?.length);
  const roadmapConfirmed = !!direction.roadmap?.confirmedAt;

  useEffect(() => {
    const saved = analysis?.grantProposal as GrantProposalSnapshot | undefined;
    if (saved?.sections?.length) {
      setProposal(saved);
      if (GRANT_TYPES.includes(saved.grantType as GrantType)) {
        setGrantType(saved.grantType as GrantType);
      }
    }
  }, [analysis?.grantProposal]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await generateGrantProposal(slug, grantType);
      setProposal(result);
      toast.success("申请书已生成");
      onGenerated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!proposal) return;
    const markdown = [
      `# ${proposal.title}`,
      `> ${proposal.grantType} · 生成于 ${new Date(proposal.generatedAt).toLocaleDateString("zh-CN")}`,
      "",
      ...proposal.sections.map((s) => `## ${s.heading}\n\n${s.content}`),
    ].join("\n\n");

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proposal.title.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {!proposal ? (
        <>
          <div className="flex flex-wrap gap-2">
            {GRANT_TYPES.map((t) => (
              <Button
                key={t}
                variant={grantType === t ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 rounded-full text-xs",
                  grantType === t && "bg-[#1a5632] hover:bg-[#144a2a]",
                )}
                onClick={() => setGrantType(t)}
              >
                {t}
              </Button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <FileText className="h-10 w-10 text-[#9aa8a0]" />
            <div>
              <p className="text-sm text-[#6b7c72]">
                基于方向资产、8 维分析与路线图，生成 <strong>{grantType}</strong> 申请书
              </p>
              <p className="mt-1 text-xs text-[#9aa8a0]">
                立项依据 ← D3 · 研究现状 ← 知识库 RAG · 预期成果 ← 路线图
              </p>
            </div>

            {!hasAnalysis && (
              <div className="rounded-md bg-[#dc2626]/8 px-3 py-2 text-[11px] text-[#dc2626]">
                请先完成 Phase 2 八维度分析
              </div>
            )}
            {hasAnalysis && !roadmapConfirmed && (
              <div className="rounded-md bg-[#b8975a]/8 px-3 py-2 text-[11px] text-[#b8975a]">
                建议先确认论文路线图，预期成果章节将更准确
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={loading || !hasAnalysis}
              className={cn("gap-1.5", siteTheme.btnPrimary)}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> 生成中…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> 生成 {grantType} 申请书</>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-semibold text-[#122820]">{proposal.title}</h4>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-[#1a5632]/20 text-[#1a5632]">
                  {proposal.grantType}
                </Badge>
                <span className="text-[10px] text-[#9aa8a0]">
                  {proposal.sections.length} 个章节 · 已保存
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleDownload}>
                <Download className="h-3 w-3" /> 导出 Markdown
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setProposal(null)}>
                重新生成
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-4 pr-2">
              {proposal.sections.map((section, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[#1a5632]/8 bg-white p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[#1a5632]/8 text-[10px] font-bold text-[#1a5632]">
                      {i + 1}
                    </span>
                    <h5 className="text-sm font-semibold text-[#122820]">{section.heading}</h5>
                  </div>
                  <div className="prose prose-sm max-w-none text-[#3d4f46] text-xs leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
