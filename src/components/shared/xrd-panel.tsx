"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Radar, ImageIcon, Box, Layers, Ruler, ExternalLink, Atom, GitBranch, PictureInPicture } from "lucide-react";
import { useRouter } from "next/navigation";
import { PeakFitCard } from "@/components/shared/xrd/peakfit-card";
import { BackgroundCard } from "@/components/shared/xrd/background-card";
import { UnitCellCard } from "@/components/shared/xrd/unitcell-card";
import { AmorphousCard } from "@/components/shared/xrd/amorphous-card";
import { BraggCard } from "@/components/shared/xrd/bragg-card";
import { MolCard } from "@/components/shared/xrd/mol-card";
import { FlowCard } from "@/components/shared/xrd/flow-card";
import { MechanismCard } from "@/components/shared/xrd/mechanism-card";
import { ImagePreviewDialog, type PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

type XrdTool = "peakfit" | "background" | "unitcell" | "amorphous" | "bragg" | "mol" | "flow" | "mechanism";

interface XrdPanelProps {
  projectId: string;
  activeSection?: string;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

const TOOLS: { id: XrdTool; label: string; icon: React.ElementType }[] = [
  { id: "peakfit", label: "峰分解", icon: Radar },
  { id: "background", label: "背景扣除", icon: ImageIcon },
  { id: "unitcell", label: "晶胞", icon: Box },
  { id: "amorphous", label: "非晶态", icon: Layers },
  { id: "bragg", label: "布拉格", icon: Ruler },
  { id: "mol", label: "分子结构", icon: Atom },
  { id: "flow", label: "流程图", icon: GitBranch },
  { id: "mechanism", label: "机理图", icon: PictureInPicture },
];

export function XrdPanel({ projectId, onInsertToPaper }: XrdPanelProps) {
  const router = useRouter();
  const [activeTool, setActiveTool] = useState<XrdTool>("peakfit");
  const [previewImg, setPreviewImg] = useState<PreviewImage | null>(null);

  const cardProps = { onInsertToPaper, onPreview: setPreviewImg };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tool Selector */}
      <div className="flex gap-1 p-2 border-b bg-muted/30 shrink-0 overflow-x-auto">
        {TOOLS.map(tool => (
          <Button key={tool.id} variant={activeTool === tool.id ? "default" : "ghost"}
            size="sm" className="shrink-0 text-xs h-8 px-2.5" onClick={() => setActiveTool(tool.id)}>
            <tool.icon className="h-3.5 w-3.5 mr-1" />{tool.label}
          </Button>
        ))}
      </div>

      {/* Link to XRD Lab */}
      <div className="shrink-0 px-2 pt-1">
        <Button variant="ghost" size="sm" className="w-full h-6 text-[10px] text-muted-foreground"
          onClick={() => router.push(`/xrd-lab${projectId ? `?projectId=${projectId}` : ""}`)}>
          <ExternalLink className="h-3 w-3 mr-1" /> 打开 XRD 实验室（模拟 / XPS）
        </Button>
      </div>

      {/* Tool Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {activeTool === "peakfit" && <PeakFitCard {...cardProps} />}
        {activeTool === "background" && <BackgroundCard {...cardProps} />}
        {activeTool === "unitcell" && <UnitCellCard {...cardProps} />}
        {activeTool === "amorphous" && <AmorphousCard {...cardProps} />}
        {activeTool === "bragg" && <BraggCard {...cardProps} />}
        {activeTool === "mol" && <MolCard {...cardProps} />}
        {activeTool === "flow" && <FlowCard {...cardProps} />}
        {activeTool === "mechanism" && <MechanismCard {...cardProps} />}
      </div>

      <ImagePreviewDialog preview={previewImg} onClose={() => setPreviewImg(null)} onInsertToPaper={onInsertToPaper} />
    </div>
  );
}

export default XrdPanel;
