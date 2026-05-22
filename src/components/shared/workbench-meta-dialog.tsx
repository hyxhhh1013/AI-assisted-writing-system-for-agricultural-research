"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectData } from "@/lib/store";

interface ProjectMetaDraft {
  title: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  referencesText: string;
  mode?: "review" | "research";
}

interface WorkbenchMetaDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectData;
  onSave: (draft: ProjectMetaDraft) => void;
}

export function WorkbenchMetaDialog({ open, onClose, project, onSave }: WorkbenchMetaDialogProps) {
  const [tempMeta, setTempMeta] = useState<ProjectMetaDraft>({
    title: project.title || "",
    authors: project.authors || "",
    affiliations: project.affiliations || "",
    abstract: project.abstract || "",
    keywords: project.keywords || "",
    classification: project.classification || "",
    researchDirection: project.researchDirection || "",
    outline: project.outline || "",
    template: project.template || "sci",
    referencesText: (project.references || []).join("\n"),
    mode: project.mode || "review",
  });

  useEffect(() => {
    if (open) {
      setTempMeta({
        title: project.title || "",
        authors: project.authors || "",
        affiliations: project.affiliations || "",
        abstract: project.abstract || "",
        keywords: project.keywords || "",
        classification: project.classification || "",
        researchDirection: project.researchDirection || "",
        outline: project.outline || "",
        template: project.template || "sci",
        referencesText: (project.references || []).join("\n"),
        mode: project.mode || "review",
      });
    }
  }, [open, project.id]);

  const handleSave = () => {
    onSave(tempMeta);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[1040px] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="shrink-0">
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>项目设置</DialogTitle>
            <DialogDescription>
              管理论文元数据、投稿模板、摘要、大纲与参考文献。
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-2">
                  <Label htmlFor="meta-title">论文题目</Label>
                  <Input
                    id="meta-title"
                    value={tempMeta.title}
                    onChange={(e) => setTempMeta({ ...tempMeta, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-template">期刊格式模板</Label>
                  <Select value={tempMeta.template} onValueChange={(val) => setTempMeta({ ...tempMeta, template: val || "sci" })}>
                    <SelectTrigger id="meta-template">
                      <SelectValue placeholder="选择期刊格式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sci">标准 SCI 格式</SelectItem>
                      <SelectItem value="nature">Nature 官方风格</SelectItem>
                      <SelectItem value="ieee">IEEE 会刊格式</SelectItem>
                      <SelectItem value="gbt7713">GB/T 7713</SelectItem>
                      <SelectItem value="cas">中科院期刊风格</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-mode">写作模式</Label>
                <Select value={tempMeta.mode || "review"} onValueChange={(val) => setTempMeta({ ...tempMeta, mode: val as "review" | "research" })}>
                  <SelectTrigger id="meta-mode">
                    <SelectValue placeholder="选择写作模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="review">综述模式 — 文献驱动，适合撰写文献综述</SelectItem>
                    <SelectItem value="research">研究论文 — 数据驱动，定量结论需引用实验数据</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meta-authors">作者姓名</Label>
                  <Input
                    id="meta-authors"
                    value={tempMeta.authors}
                    onChange={(e) => setTempMeta({ ...tempMeta, authors: e.target.value })}
                    placeholder="Zhang San, Li Si*"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-affiliations">单位机构信息</Label>
                  <Input
                    id="meta-affiliations"
                    value={tempMeta.affiliations || ""}
                    onChange={(e) => setTempMeta({ ...tempMeta, affiliations: e.target.value })}
                    placeholder="农业科学研究中心，北京 100083"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meta-keywords">关键词</Label>
                  <Input
                    id="meta-keywords"
                    value={tempMeta.keywords}
                    onChange={(e) => setTempMeta({ ...tempMeta, keywords: e.target.value })}
                    placeholder="农业科技；AI辅助写作；热化学"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-classification">中图分类号</Label>
                  <Input
                    id="meta-classification"
                    value={tempMeta.classification}
                    onChange={(e) => setTempMeta({ ...tempMeta, classification: e.target.value })}
                    placeholder="例如：S-1; TP391"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-research-direction">研究方向 / 主题说明</Label>
                <Textarea
                  id="meta-research-direction"
                  className="min-h-[92px] resize-y"
                  value={tempMeta.researchDirection}
                  onChange={(e) => setTempMeta({ ...tempMeta, researchDirection: e.target.value })}
                  placeholder="例如：生物质与塑料协同热解、催化升级、碳材料制备..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-abstract">摘要 (Abstract)</Label>
                <Textarea
                  id="meta-abstract"
                  className="min-h-[190px] resize-y"
                  value={tempMeta.abstract}
                  onChange={(e) => setTempMeta({ ...tempMeta, abstract: e.target.value })}
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="meta-outline">论文大纲 / 论证提纲</Label>
                <Textarea
                  id="meta-outline"
                  className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                  value={tempMeta.outline}
                  onChange={(e) => setTempMeta({ ...tempMeta, outline: e.target.value })}
                  placeholder="可粘贴 Markdown 大纲，侧栏扩写会读取这里的任务结构。"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meta-references">参考文献列表</Label>
                <Textarea
                  id="meta-references"
                  className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                  value={tempMeta.referencesText}
                  onChange={(e) => setTempMeta({ ...tempMeta, referencesText: e.target.value })}
                  placeholder="每行一条参考文献；正文引用重排会按 [n] 重新整理这里。"
                />
              </div>
            </section>
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave}>保存更新</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
