"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Layout, BarChart3, Radar, BookOpen,
  FileText, FileSearch, Search, Save,
} from "lucide-react";
import type { WorkbenchTab } from "@/app/workbench/page";

interface WorkbenchTabSwitcherProps {
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  isWritingGenerating: boolean;
  handleSave: () => void;
  projectId: string | null;
  setRightPanelMode: (mode: "preview" | "reader") => void;
  setIsPreviewOpen: (open: boolean) => void;
}

const TABS: { id: WorkbenchTab; icon: typeof Layout; title: string }[] = [
  { id: "structure", icon: Layout, title: "IMRaD 章节：摘要 / 引言 / 方法 / 结果 / 结论" },
  { id: "analysis", icon: BarChart3, title: "实验数据摘要与趋势描述" },
  { id: "xrd", icon: Radar, title: "XRD 分析：峰分解 / 背景扣除 / 晶胞可视化" },
  { id: "outline", icon: BookOpen, title: "论证提纲：AI 生成目录树（与左侧 IMRaD 并列，非同一套）" },
  { id: "writing", icon: FileText, title: "侧栏整章扩写（RAG + 多阶段），应用后写入所选章" },
  { id: "reader", icon: FileSearch, title: "本地文献库 PDF" },
  { id: "plagiarism", icon: Search, title: "论文查重与 AI 降重" },
];

export function WorkbenchTabSwitcher({
  activeTab, setActiveTab, isWritingGenerating,
  handleSave, projectId, setRightPanelMode, setIsPreviewOpen,
}: WorkbenchTabSwitcherProps) {
  const router = useRouter();

  return (
    <div className="w-14 border-r bg-card flex flex-col items-center py-4 gap-4 shrink-0">
      <Button variant="ghost" size="icon" onClick={() => router.push("/projects")} title="返回项目列表">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex-1 flex flex-col gap-2">
        {TABS.map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="icon"
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "reader") {
                setRightPanelMode("reader");
                setIsPreviewOpen(true);
              }
            }}
            title={tab.title}
            className={cn(
              tab.id === "writing" && isWritingGenerating && activeTab !== "writing" && "ring-2 ring-primary animate-pulse"
            )}
          >
            <tab.icon className={cn("h-5 w-5", tab.id === "writing" && isWritingGenerating && "text-primary")} />
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="icon"
        onClick={() => router.push(`/plot?id=${projectId}`)}
        title="数据绘图—分组柱状图、堆积图、折线图、三线表"
      >
        <BarChart3 className="h-5 w-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleSave} title="保存项目">
        <Save className="h-5 w-5" />
      </Button>
    </div>
  );
}
