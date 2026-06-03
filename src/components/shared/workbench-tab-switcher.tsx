"use client";

import { useRouter } from "next/navigation";
import { useGoBack } from "@/contexts/navigation-history";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getModeAccent,
  getStructureTabTooltip,
  getOutlineTabTooltip,
} from "@/lib/mode-theme";
import { siteTheme } from "@/lib/site-theme";
import {
  ArrowLeft, Layout, Database, Radar, BookOpen,
  FileText, FileSearch, Search, Save,
} from "lucide-react";
import type { WorkbenchTab } from "@/app/workbench/page";
import { getModuleHref, listModules, MODULE_ICON_MAP } from "@/lib/module-registry";

interface WorkbenchTabSwitcherProps {
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  isWritingGenerating: boolean;
  handleSave: () => void;
  projectId: string | null;
  projectMode: "review" | "research";
  setRightPanelMode: (mode: "preview" | "reader") => void;
  setIsPreviewOpen: (open: boolean) => void;
}

const TAB_DEFS: { id: WorkbenchTab; icon: typeof Layout; researchOnly?: boolean }[] = [
  { id: "structure", icon: Layout },
  { id: "data", icon: Database, researchOnly: true },
  { id: "xrd", icon: Radar },
  { id: "outline", icon: BookOpen },
  { id: "writing", icon: FileText },
  { id: "reader", icon: FileSearch },
  { id: "plagiarism", icon: Search },
];

function getTabTitle(tab: WorkbenchTab, mode: "review" | "research"): string {
  switch (tab) {
    case "structure":
      return getStructureTabTooltip(mode);
    case "data":
      return "实验数据：上传 CSV/Excel、证据提取、AI 趋势描述（仅研究论文模式）";
    case "xrd":
      return "XRD 分析：峰分解 / 背景扣除 / 晶胞可视化";
    case "outline":
      return getOutlineTabTooltip(mode);
    case "writing":
      return "侧栏整章扩写（RAG + 多阶段），应用后写入所选章";
    case "reader":
      return "本地文献库 PDF";
    case "plagiarism":
      return "论文质量检测：查重 / 降重 / 审查";
    default:
      return "";
  }
}

export function WorkbenchTabSwitcher({
  activeTab, setActiveTab, isWritingGenerating,
  handleSave, projectId, projectMode,
  setRightPanelMode, setIsPreviewOpen,
}: WorkbenchTabSwitcherProps) {
  const goBack = useGoBack();
  const router = useRouter();
  const sidebarModules = listModules({ placement: "workbench-sidebar" });
  const visibleTabs = TAB_DEFS.filter((tab) => !tab.researchOnly || projectMode === "research");
  const accent = getModeAccent(projectMode);

  return (
    <div className={cn("w-14 border-r flex flex-col items-center py-4 gap-4 shrink-0 bg-white/90", siteTheme.border, accent.borderTint)}>
      <Button variant="ghost" size="icon" onClick={() => goBack("/projects")} title="返回项目中心" className={siteTheme.btnGhost}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex-1 flex flex-col gap-2">
        {visibleTabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
          <Button
            key={tab.id}
            variant={isActive ? "default" : "ghost"}
            size="icon"
            onClick={() => {
              if (tab.id === "plagiarism") {
                router.push(`/plagiarism?id=${projectId}`);
              } else {
                setActiveTab(tab.id);
                if (tab.id === "reader") {
                  setRightPanelMode("reader");
                  setIsPreviewOpen(true);
                }
              }
            }}
            title={getTabTitle(tab.id, projectMode)}
            className={cn(
              isActive && accent.activeTab,
              !isActive && siteTheme.btnGhost,
              tab.id === "writing" && isWritingGenerating && !isActive && cn("animate-pulse ring-2", accent.ring),
            )}
          >
            <tab.icon className={cn("h-5 w-5", tab.id === "writing" && isWritingGenerating && !isActive && accent.iconText)} />
          </Button>
        );})}
      </div>
      {sidebarModules.map((module) => {
        const Icon = MODULE_ICON_MAP[module.iconKey];
        return (
          <Button
            key={module.id}
            variant="ghost"
            size="icon"
            onClick={() => router.push(getModuleHref(module, projectId))}
            title={module.description}
          >
            <Icon className="h-5 w-5" />
          </Button>
        );
      })}
      <Button variant="ghost" size="icon" onClick={handleSave} title="保存项目" className={siteTheme.btnGhost}>
        <Save className="h-5 w-5" />
      </Button>
    </div>
  );
}
