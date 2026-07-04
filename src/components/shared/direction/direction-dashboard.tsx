"use client";

import { Compass, FileText, CheckCircle, Send, TrendingUp, ArrowRight, Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DirectionRoadmap } from "@/contracts/direction";

interface DirectionDashboardProps {
  assetCount: number;
  analysisDone: boolean;
  analysisScore?: number | null;
  roadmap?: DirectionRoadmap | null;
  onJumpToTab?: (tabId: string) => void;
}

export function DirectionDashboard({
  assetCount,
  analysisDone,
  analysisScore,
  roadmap,
  onJumpToTab,
}: DirectionDashboardProps) {
  const paperCounts = {
    total: roadmap?.papers?.length || 0,
    planned: roadmap?.papers?.filter((p) => p.status === "planned").length || 0,
    writing: roadmap?.papers?.filter((p) => p.status === "writing").length || 0,
    submitted: roadmap?.papers?.filter((p) => p.status === "submitted").length || 0,
    published: roadmap?.papers?.filter((p) => p.status === "published").length || 0,
  };

  const activeCount = paperCounts.writing + paperCounts.submitted + paperCounts.published;

  const stats = [
    { label: "资产", value: assetCount, icon: Compass, color: "text-[#1a5632]", bg: "bg-[#1a5632]/8" },
    { label: "规划中", value: paperCounts.total, icon: FileText, color: "text-[#2563eb]", bg: "bg-[#2563eb]/8" },
    { label: "进行中", value: activeCount, icon: TrendingUp, color: "text-[#b8975a]", bg: "bg-[#b8975a]/8" },
    {
      label: "综合评分",
      value: analysisScore != null ? `${analysisScore}` : "—",
      icon: CheckCircle,
      color: "text-[#6366f1]",
      bg: "bg-[#6366f1]/8",
    },
  ];

  return (
    <div className="space-y-3">
      {/* 统计卡片行 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-lg border border-[#1a5632]/8 bg-white px-3 py-2.5">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", s.bg)}>
              <s.icon className={cn("h-3.5 w-3.5", s.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold tabular-nums text-[#122820]">{s.value}</p>
              <p className="text-[10px] text-[#9aa8a0] truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 进度条 */}
      {paperCounts.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[#9aa8a0]">
            <span>论文进度</span>
            <span>{activeCount}/{paperCounts.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1a5632]/6">
            <div className="flex h-full">
              {paperCounts.published > 0 && (
                <div className="bg-[#6366f1]" style={{ width: `${(paperCounts.published / paperCounts.total) * 100}%` }} />
              )}
              {paperCounts.submitted > 0 && (
                <div className="bg-[#2563eb]" style={{ width: `${(paperCounts.submitted / paperCounts.total) * 100}%` }} />
              )}
              {paperCounts.writing > 0 && (
                <div className="bg-[#b8975a]" style={{ width: `${(paperCounts.writing / paperCounts.total) * 100}%` }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Material Passport 版本信息 */}
      {analysisDone && (
        <div className="flex items-center gap-2 text-[10px] text-[#9aa8a0] px-1">
          <History className="h-3 w-3" />
          <span>
            分析于 {roadmap?.generatedAt ? new Date(roadmap.generatedAt).toLocaleDateString("zh-CN") : "—"} ·
            资产 {assetCount} 项 · 路线图 {paperCounts.total} 篇
          </span>
        </div>
      )}

      {/* 下一步行动（可点击跳转） */}
      {!analysisDone && assetCount >= 3 && (
        <button
          className="flex w-full items-center gap-2 rounded-lg border border-[#b8975a]/30 bg-[#b8975a]/5 px-3 py-2 text-left text-xs text-[#b8975a] transition-colors hover:bg-[#b8975a]/10"
          onClick={() => onJumpToTab?.("contract")}
        >
          <Send className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">下一步：设置评价标准（预承诺）→ 启动分析</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
        </button>
      )}
      {!analysisDone && assetCount < 3 && (
        <div className="flex items-center gap-2 rounded-lg border border-[#b8975a]/30 bg-[#b8975a]/5 px-3 py-2 text-xs text-[#b8975a]">
          <Send className="h-3.5 w-3.5 shrink-0" />
          <span>下一步：需要至少 3 项资产（含 1 个实验）才能启动分析</span>
        </div>
      )}
      {analysisDone && paperCounts.total === 0 && (
        <button
          className="flex w-full items-center gap-2 rounded-lg border border-[#b8975a]/30 bg-[#b8975a]/5 px-3 py-2 text-left text-xs text-[#b8975a] transition-colors hover:bg-[#b8975a]/10"
          onClick={() => onJumpToTab?.("roadmap")}
        >
          <Send className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">下一步：分析已完成 → 生成论文路线图</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
        </button>
      )}
      {paperCounts.planned > 0 && activeCount === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-[#2563eb]/20 bg-[#2563eb]/5 px-3 py-2 text-xs text-[#2563eb]">
          <Send className="h-3.5 w-3.5 shrink-0" />
          <span>下一步：选择一篇 ready 论文，点击「开始写作」创建写作项目</span>
        </div>
      )}
    </div>
  );
}
