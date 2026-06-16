"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, FileCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
import {
  appendChartAsset,
  appendProjectSectionMarkdown,
  getProject,
  listProjects,
} from "@/services/project";
import type { ProjectListItem } from "@/services/project";
import { parseProjectCharts } from "@/contracts/figure";
import {
  getSectionKeysForMode,
  getSectionLabelForMode,
  getProjectWritingMode,
} from "@/lib/section-registry";

interface PlotInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  caption: string;
  /** 从 /plot?id= 带入的默认项目 */
  defaultProjectId?: string;
  /** registry figure id，写入 charts 资产 */
  figureId?: string;
  svgUrl?: string;
  pdfUrl?: string;
}

export function PlotInsertDialog({
  open,
  onOpenChange,
  imageUrl,
  caption,
  defaultProjectId,
  figureId = "chart",
  svgUrl,
  pdfUrl,
}: PlotInsertDialogProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("results");
  const [sectionOptions, setSectionOptions] = useState<{ key: string; label: string }[]>([]);
  const [insertCaption, setInsertCaption] = useState(caption);
  const [inserting, setInserting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInsertCaption(caption);
  }, [open, caption]);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    void listProjects().then((list) => {
      setProjects(list);
      const initialId =
        defaultProjectId && list.some((p) => p.id === defaultProjectId)
          ? defaultProjectId
          : list[0]?.id ?? "";
      setSelectedProject(initialId);
    });
  }, [open, defaultProjectId]);

  useEffect(() => {
    if (!open || !selectedProject) return;
    void getProject(selectedProject).then((project) => {
      if (!project) return;
      const mode = getProjectWritingMode(project.mode);
      const keys = getSectionKeysForMode(mode);
      const options = keys.map((key) => ({
        key,
        label: getSectionLabelForMode(key, mode),
      }));
      setSectionOptions(options);
      const preferred = mode === "research" ? "results" : "literature_body";
      if (keys.includes(preferred)) {
        setSelectedSection(preferred);
      } else if (keys[0]) {
        setSelectedSection(keys[0]);
      }
      const chartCount = parseProjectCharts(project.charts).length;
      const numbered = caption.match(/^图\s*\d+/);
      if (!numbered) {
        setInsertCaption(`图${chartCount + 1} ${caption}`.trim());
      }
    });
  }, [open, selectedProject, caption]);

  const markdown = `\n\n![${insertCaption}](${imageUrl})\n\n`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(markdown).then(() => {
      setDone(true);
      toast.success("Markdown 已复制");
    });
  };

  const handleInsert = async () => {
    if (!selectedProject || !selectedSection) return;
    setInserting(true);
    try {
      await appendProjectSectionMarkdown(selectedProject, selectedSection, markdown);
      await appendChartAsset(selectedProject, {
        figureId,
        caption: insertCaption,
        imageUrl,
        svgUrl,
        pdfUrl,
        sectionKey: selectedSection,
      });
      setDone(true);
      toast.success("已插入章节并登记图表资产");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setInserting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>插入到论文</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <FileCheck className="h-10 w-10 text-[#1a5632]" />
            <p className="text-sm text-muted-foreground">已成功插入</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                图片预览
              </p>
              <img
                src={imageUrl}
                alt={insertCaption}
                className="max-h-40 w-full rounded object-contain"
              />
              <p className="mt-2 text-xs text-muted-foreground">{insertCaption}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">图题（插入时使用）</label>
              <Input
                value={insertCaption}
                onChange={(e) => setInsertCaption(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">目标项目</label>
              <Select value={selectedProject} onValueChange={(v) => v && setSelectedProject(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title || "未命名论文"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">插入章节</label>
              <Select value={selectedSection} onValueChange={(v) => v && setSelectedSection(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-1.5" />
                复制 Markdown
              </Button>
              <Button
                onClick={handleInsert}
                disabled={!selectedProject || inserting}
                className="bg-[#1a5632] hover:bg-[#144a2a]"
              >
                {inserting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <FileCheck className="h-4 w-4 mr-1.5" />
                )}
                插入到章节
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
