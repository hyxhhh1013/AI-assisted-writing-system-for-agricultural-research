"use client";

import { useRouter } from "next/navigation";
import { useGoBack } from "@/contexts/navigation-history";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getModeAccent, getDataTabTooltip, getOutlineTabTooltip, getStructureTabTooltip } from "@/lib/mode-theme";
import { siteTheme } from "@/lib/site-theme";
import {
  ArrowLeft, Layout, Database, Radar, BookOpen,
  FileText, FileSearch, Search, Save, Bot, Wrench,
} from "lucide-react";
import type { WorkbenchTab } from "@/app/workbench/page";
import { getModuleHref, listModules, MODULE_ICON_MAP } from "@/lib/module-registry";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
  isWorkbenchExpertTab,
  shouldShowAllWorkbenchTabs,
} from "@/lib/workbench-visible-tabs";

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

const AGENT_TAB_ENABLED = process.env.NEXT_PUBLIC_AGENT_ENABLED === "1";

const TAB_DEFS: { id: WorkbenchTab; icon: typeof Layout }[] = [
  ...(AGENT_TAB_ENABLED ? [{ id: "agent" as const, icon: Bot }] : []),
  { id: "structure", icon: Layout },
  { id: "data", icon: Database },
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
      return getDataTabTooltip(mode);
    case "xrd":
      return "XRD 分析：峰分解 / 背景扣除 / 晶胞可视化";
    case "outline":
      return getOutlineTabTooltip(mode);
    case "writing":
      return "侧栏整章扩写（RAG + 多阶段），应用后写入所选章";
    case "agent":
      return "AI Agent：边聊边做（检索 / 写回 / 检查点）";
    case "reader":
      return "补录参考文献或阅读 PDF";
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
  const showAllTabs = shouldShowAllWorkbenchTabs();
  const visibleTabs = showAllTabs
    ? TAB_DEFS
    : TAB_DEFS.filter((tab) => !isWorkbenchExpertTab(tab.id));
  const expertTabs = TAB_DEFS.filter((tab) => isWorkbenchExpertTab(tab.id));
  const expertActive = isWorkbenchExpertTab(activeTab);
  const accent = getModeAccent(projectMode);

  const handleTabClick = (tabId: WorkbenchTab) => {
    setActiveTab(tabId);
    if (tabId === "reader") {
      setRightPanelMode("reader");
      setIsPreviewOpen(true);
    }
  };

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
            onClick={() => handleTabClick(tab.id)}
            title={getTabTitle(tab.id, projectMode)}
            className={cn(
              "relative",
              isActive && accent.activeTab,
              !isActive && siteTheme.btnGhost,
              tab.id === "writing" && isWritingGenerating && !isActive && cn("animate-pulse ring-2", accent.ring),
            )}
          >
            <tab.icon className={cn("h-5 w-5", tab.id === "writing" && isWritingGenerating && !isActive && accent.iconText)} />
          </Button>
        );})}
        {!showAllTabs ? (
          <Popover>
            <PopoverTrigger
              title="专家工具（数据 / XRD / 大纲 / 扩写）"
              className={cn(
                "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
                expertActive && accent.activeTab,
                !expertActive && siteTheme.btnGhost,
              )}
            >
              <Wrench className="h-5 w-5" />
            </PopoverTrigger>
            <PopoverPopup className="w-52 p-2">
              <p className="mb-1.5 px-2 text-[11px] text-muted-foreground">专家工具</p>
              {expertTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-black/5",
                    activeTab === tab.id && "bg-black/5 font-medium",
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{getTabTitle(tab.id, projectMode)}</span>
                </button>
              ))}
            </PopoverPopup>
          </Popover>
        ) : null}
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
