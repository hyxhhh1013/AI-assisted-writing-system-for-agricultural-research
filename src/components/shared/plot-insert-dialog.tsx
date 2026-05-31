"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { projectStore } from "@/lib/store";
import type { ProjectListItem } from "@/services/project";

const IMRAD_SECTIONS = [
  { key: "abstract", label: "摘要 (Abstract)" },
  { key: "introduction", label: "引言 (Introduction)" },
  { key: "methods", label: "方法 (Methods)" },
  { key: "results", label: "结果 (Results)" },
  { key: "conclusion", label: "结论 (Conclusion)" },
];

interface PlotInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  caption: string;
}

export function PlotInsertDialog({
  open,
  onOpenChange,
  imageUrl,
  caption,
}: PlotInsertDialogProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("abstract");
  const [inserting, setInserting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setDone(false);
      void projectStore.list().then((list) => {
        setProjects(list);
        if (list.length > 0 && !selectedProject) {
          setSelectedProject(list[0].id);
        }
      });
    }
  }, [open]);

  const markdown = `\n\n![${caption}](${imageUrl})\n\n`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(markdown).then(() => {
      setDone(true);
    });
  };

  const handleInsert = async () => {
    if (!selectedProject || !selectedSection) return;
    setInserting(true);
    try {
      // 获取项目当前 section 内容，追加图片 markdown
      const project = await projectStore.get(selectedProject);
      if (!project) return;
      const current = project.sections[selectedSection] ?? "";
      const updated = current + markdown;
      await projectStore.save({
        ...project,
        sections: { ...project.sections, [selectedSection]: updated },
      });
      setDone(true);
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
            {/* 预览 */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                图片预览
              </p>
              <img
                src={imageUrl}
                alt={caption}
                className="max-h-40 w-full rounded object-contain"
              />
              <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
            </div>

            {/* 项目选择 */}
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

            {/* 章节选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium">插入章节</label>
              <Select value={selectedSection} onValueChange={(v) => v && setSelectedSection(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMRAD_SECTIONS.map((s) => (
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
