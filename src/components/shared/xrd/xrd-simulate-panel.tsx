"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, Radar } from "lucide-react";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

interface XrdSimulatePanelProps extends PlotToolProps {
  projectId: string;
}

export function XrdSimulatePanel({ title: toolTitle, description, projectId }: XrdSimulatePanelProps) {
  const router = useRouter();

  return (
    <PlotWorkspace
      title={toolTitle ?? "XRD 图谱模拟"}
      description={description ?? "从晶体结构模拟粉末衍射图谱"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-5 pt-3">
            <p className="text-xs leading-relaxed text-[#6b7c72]">
              图谱模拟需要上传 CIF 结构并配置波长、角度范围等参数，功能集中在 XRD 实验室中。
            </p>
            <Button
              className="w-full gap-2 bg-[#1a5632] hover:bg-[#144228]"
              onClick={() => router.push(`/xrd-lab${projectId ? `?projectId=${projectId}` : ""}`)}
            >
              <ExternalLink className="h-4 w-4" />
              打开 XRD 实验室
            </Button>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="模拟预览"
          loading={false}
          canGenerate={false}
          onGenerate={() => {}}
          generateLabel="生成模拟图"
          emptyTitle="前往 XRD 实验室"
          emptyHint="点击左侧按钮进入 XRD 实验室，使用完整的图谱模拟与 XPS 分析工具。"
        >
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <Radar className="h-12 w-12 text-[#1a5632]/30" />
            <p className="text-sm font-medium text-[#122820]">模拟功能在 XRD 实验室</p>
            <p className="max-w-xs text-xs text-[#6b7c72]">支持 CIF 结构导入、多相模拟、XPS 峰拟合等高级分析。</p>
          </div>
        </PlotPreviewPane>
      }
    />
  );
}
