"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, Copy, FileCheck, Loader2 } from "lucide-react";
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
  figureSpecEnc?: string;
  /** 非图片内容（如三线表 HTML）插入时使用，优先于 imageUrl 生成的 Markdown */
  customMarkdown?: string;
  /** 表格等内容预览 HTML */
  contentHtml?: string;
  /** 为 false 时只追加章节 Markdown，不新增 charts 资产（用于已登记图再次插入） */
  registerAsset?: boolean;
  onSuccess?: (payload: { projectId: string; sectionKey: string }) => void;
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
  figureSpecEnc,
  customMarkdown,
  contentHtml,
  registerAsset = true,
  onSuccess,
}: PlotInsertDialogProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("results");
  const [sectionOptions, setSectionOptions] = useState<{ key: string; label: string }[]>([]);
  const [insertCaption, setInsertCaption] = useState(caption);
  const [inserting, setInserting] = useState(false);
  const [done, setDone] = useState(false);
  const [insertedProjectId, setInsertedProjectId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setInsertCaption(caption);
  }, [open, caption]);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setInsertedProjectId(null);
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
      const numbered = caption.match(/^图\s*\d+|^表\s*\d+/);
      if (!numbered && registerAsset) {
        const prefix = figureId === "table_three_line" ? "表" : "图";
        setInsertCaption(`${prefix}${chartCount + 1} ${caption}`.trim());
      }
    });
  }, [open, selectedProject, caption, registerAsset, figureId]);

  const markdown =
    customMarkdown ?? `\n\n![${insertCaption}](${imageUrl})\n\n`;

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
      const shouldRegisterAsset = registerAsset && Boolean(imageUrl);
      if (shouldRegisterAsset) {
        await appendChartAsset(selectedProject, {
          figureId,
          caption: insertCaption,
          imageUrl,
          svgUrl,
          pdfUrl,
          sectionKey: selectedSection,
          figureSpecEnc,
        });
      }
      setDone(true);
      setInsertedProjectId(selectedProject);
      onSuccess?.({ projectId: selectedProject, sectionKey: selectedSection });
      toast.success(
        shouldRegisterAsset
          ? "已插入章节并登记图表资产"
          : customMarkdown
            ? "已插入章节"
            : "已再次插入到章节",
      );
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
          <DialogTitle>{registerAsset ? "插入到论文" : "再次插入到章节"}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <FileCheck className="h-10 w-10 text-[#1a5632]" />
            <p className="text-sm text-muted-foreground">已成功插入</p>
            <div className="flex gap-2">
              {insertedProjectId && (
                <Button
                  className="bg-[#1a5632] hover:bg-[#144a2a]"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/workbench?id=${encodeURIComponent(insertedProjectId)}`);
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  返回工作台
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                继续作图
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {contentHtml && !imageUrl ? "内容预览" : "图片预览"}
              </p>
              {contentHtml && !imageUrl ? (
                <div
                  className="max-h-40 overflow-auto rounded bg-white p-2 text-xs"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
              ) : (
                <img
                  src={imageUrl}
                  alt={insertCaption}
                  className="max-h-40 w-full rounded object-contain"
                />
              )}
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
