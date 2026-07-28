"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Radar, Layers, ExternalLink } from "lucide-react";
import { TabPanelShell } from "@/components/shared/tab-panel-shell";
import { PeakFitCard } from "@/components/shared/xrd/peakfit-card";
import { StackCard } from "@/components/shared/xrd/stack-card";
import { ImagePreviewDialog, type PreviewImage } from "@/components/shared/xrd/image-preview-dialog";
import { useState } from "react";

type XrdTool = "peakfit" | "stack";

interface XrdPanelProps {
  projectId: string;
  activeSection?: string;
  defaultTool?: XrdTool;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

const TOOLS: { id: XrdTool; label: string; icon: React.ElementType }[] = [
  { id: "stack", label: "多谱叠加", icon: Layers },
  { id: "peakfit", label: "峰拟合", icon: Radar },
];

export function XrdPanel({ projectId, defaultTool, onInsertToPaper }: XrdPanelProps) {
  const router = useRouter();
  const [activeTool, setActiveTool] = useState<XrdTool>(defaultTool ?? "stack");
  const [previewImg, setPreviewImg] = useState<PreviewImage | null>(null);

  const cardProps = { onInsertToPaper, onPreview: setPreviewImg };
  const plotHref = `/plot?category=xrd&figure=xrd_workflow${projectId ? `&id=${projectId}` : ""}`;

  return (
    <TabPanelShell
      title="光谱分析"
      icon={Radar}
      tools={
        <div className="flex w-full gap-1">
          {TOOLS.map((tool) => (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? "default" : "ghost"}
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => setActiveTool(tool.id)}
            >
              <tool.icon className="mr-1 h-3 w-3" />
              {tool.label}
            </Button>
          ))}
        </div>
      }
    >
      <div className="shrink-0 space-y-1 pb-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-[10px]"
          onClick={() => router.push(plotHref)}
        >
          <ExternalLink className="mr-1 h-3 w-3" />
          打开完整光谱中心（XPS / Scherrer / 模拟…）
        </Button>
      </div>
      {activeTool === "peakfit" && <PeakFitCard {...cardProps} />}
      {activeTool === "stack" && <StackCard {...cardProps} />}
      <ImagePreviewDialog
        preview={previewImg}
        onClose={() => setPreviewImg(null)}
        onInsertToPaper={onInsertToPaper}
      />
    </TabPanelShell>
  );
}

export default XrdPanel;
