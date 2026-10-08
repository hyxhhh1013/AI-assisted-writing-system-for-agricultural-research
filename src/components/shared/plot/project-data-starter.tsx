"use client";

import { useEffect, useState } from "react";
import { getProject } from "@/services/project";
import { parseDataSources } from "@/contracts/project";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import type { ChartPanelPrefill } from "@/contracts/figure";
import { prefillFromSource, tableSeedsFromSource, type TableGroupSeed } from "@/lib/plot-source-prefill";

function blockLabel(fileName: string): string {
  const mark = fileName.indexOf(" · ");
  return mark === -1 ? fileName : fileName.slice(mark + 3).trim() || fileName;
}

export function ProjectChartStarter({
  projectId,
  onPick,
}: {
  projectId?: string;
  onPick: (prefill: ChartPanelPrefill, note: string) => void;
}) {
  const [sources, setSources] = useState<DataSourceAnalysis[] | null>(null);

  useEffect(() => {
    if (!projectId || projectId === "default") return;
    let cancelled = false;
    void getProject(projectId).then((project) => {
      if (cancelled || !project) return;
      setSources(parseDataSources(project));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const usable = (sources ?? []).filter((source) => prefillFromSource(source));
  if (!projectId || projectId === "default" || usable.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#1a5632]/14 bg-[#f4f7f4] p-2.5">
      <p className="text-[12px] font-medium text-[#122820]">从已入库的数据开始</p>
      <p className="mt-0.5 text-[11px] leading-5 text-[#5a7a68]">
        点一块就填进下面。然后改标题、坐标轴和样式，再生成。不想自己改，回到对话里让助手画。
      </p>
      <div className="mt-2 flex max-h-28 flex-col gap-1 overflow-auto">
        {usable.map((source) => (
          <button
            key={source.fileName}
            type="button"
            className="truncate rounded-md bg-white px-2 py-1 text-left text-[12px] text-[#122820] ring-1 ring-[#1a5632]/10 hover:ring-[#1a5632]/30"
            onClick={() => {
              const built = prefillFromSource(source);
              if (built) onPick(built.prefill, built.note);
            }}
          >
            {blockLabel(source.fileName)}
            <span className="ml-1 text-[10px] text-[#8aa090]">{source.rowCount} 行</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectTableStarter({
  projectId,
  onPick,
}: {
  projectId?: string;
  onPick: (seeds: TableGroupSeed[], variable: string) => void;
}) {
  const [sources, setSources] = useState<DataSourceAnalysis[] | null>(null);

  useEffect(() => {
    if (!projectId || projectId === "default") return;
    let cancelled = false;
    void getProject(projectId).then((project) => {
      if (cancelled || !project) return;
      setSources(parseDataSources(project));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const usable = (sources ?? [])
    .map((source) => ({ source, seeds: tableSeedsFromSource(source) }))
    .filter((item): item is { source: DataSourceAnalysis; seeds: TableGroupSeed[] } => item.seeds != null);

  if (!projectId || projectId === "default") return null;

  return (
    <div className="rounded-lg border border-[#1a5632]/14 bg-[#f4f7f4] p-2.5">
      <p className="text-[12px] font-medium text-[#122820]">三线表从分组均值填起</p>
      <p className="mt-0.5 text-[11px] leading-5 text-[#5a7a68]">
        {usable.length > 0
          ? "点一块，把处理组、n、均值和标准差填进下面。谱图没有分组均值，请用折线图细调，或在对话里让助手画。"
          : "已入库的表里还没有分组均值。谱图请用左侧折线细调；处理组表格可以在这里手填，或让助手生成。"}
      </p>
      {usable.length > 0 ? (
        <div className="mt-2 flex max-h-28 flex-col gap-1 overflow-auto">
          {usable.map(({ source, seeds }) => (
            <button
              key={source.fileName}
              type="button"
              className="truncate rounded-md bg-white px-2 py-1 text-left text-[12px] text-[#122820] ring-1 ring-[#1a5632]/10 hover:ring-[#1a5632]/30"
              onClick={() => onPick(seeds, seeds[0]?.variable || "指标")}
            >
              {blockLabel(source.fileName)}
              <span className="ml-1 text-[10px] text-[#8aa090]">{seeds.length} 组</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
