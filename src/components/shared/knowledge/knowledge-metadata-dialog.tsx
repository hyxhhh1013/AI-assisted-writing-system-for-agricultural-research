"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_WORK } from "@/components/ui/dialog-sizes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KnowledgeBib, KnowledgeFileRecord } from "@/contracts/knowledge";
import { getKnowledgeIndexStatus } from "@/contracts/knowledge";
import { updateKnowledgeMetadata } from "@/services/knowledge";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { KnowledgeIndexBadge } from "./knowledge-index-badge";

interface KnowledgeMetadataDialogProps {
  file: KnowledgeFileRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function emptyBib(): KnowledgeBib {
  return {};
}

function bibFromFile(file: KnowledgeFileRecord): KnowledgeBib {
  return {
    title: file.bib?.title || "",
    firstAuthor: file.bib?.firstAuthor || "",
    authors: file.bib?.authors || [],
    year: file.bib?.year,
    journal: file.bib?.journal || "",
    volume: file.bib?.volume || "",
    issue: file.bib?.issue || "",
    pages: file.bib?.pages || "",
    doi: file.bib?.doi || "",
    issn: file.bib?.issn || "",
    eissn: file.bib?.eissn || "",
    patentNumber: file.bib?.patentNumber || "",
    inventors: file.bib?.inventors || [],
    applicant: file.bib?.applicant || "",
    publicationDate: file.bib?.publicationDate || "",
    isbn: file.bib?.isbn || "",
    publisher: file.bib?.publisher || "",
  };
}

export function KnowledgeMetadataDialog({
  file,
  open,
  onOpenChange,
  onSaved,
}: KnowledgeMetadataDialogProps) {
  const [documentType, setDocumentType] = useState("paper");
  const [gbTag, setGbTag] = useState("J");
  const [bib, setBib] = useState<KnowledgeBib>(emptyBib());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!file || !open) return;
    setDocumentType(file.documentType === "journal" ? "paper" : (file.documentType || "paper"));
    setGbTag(file.gbTag || "J");
    setBib(bibFromFile(file));
  }, [file, open]);

  if (!file) return null;

  const indexInfo = getKnowledgeIndexStatus(file);
  const isPatent = documentType === "patent";
  const isBook = documentType === "book";

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const authors = bib.authors?.length
        ? bib.authors
        : bib.firstAuthor
          ? [bib.firstAuthor]
          : undefined;

      await updateKnowledgeMetadata({
        name: file.name,
        documentType,
        gbTag,
        bib: {
          ...bib,
          title: bib.title?.trim() || undefined,
          firstAuthor: bib.firstAuthor?.trim() || undefined,
          authors,
          journal: bib.journal?.trim() || undefined,
          patentNumber: bib.patentNumber?.trim() || undefined,
          applicant: bib.applicant?.trim() || undefined,
          publisher: bib.publisher?.trim() || undefined,
          doi: bib.doi?.trim() || undefined,
          issn: bib.issn?.trim() || undefined,
          eissn: bib.eissn?.trim() || undefined,
          volume: bib.volume?.trim() || undefined,
          issue: bib.issue?.trim() || undefined,
          pages: bib.pages?.trim() || undefined,
        },
      });
      toast.success("书目信息已保存，重建索引时不会覆盖");
      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_WORK}>
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>编辑书目与索引信息</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block truncate">{file.name}</span>
            <span className="flex items-center gap-2 flex-wrap">
              <KnowledgeIndexBadge file={file} />
              <span className="text-xs">{file.chunkCount} 个文本块</span>
              {indexInfo.missingFields.length > 0 && (
                <span className="text-xs text-amber-600">
                  待补：{indexInfo.missingFields.join("、")}
                </span>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2 lg:col-span-2 lg:grid-cols-2">
            <div className="grid gap-2">
              <Label>文档类型</Label>
              <Select value={documentType} onValueChange={(v) => v && setDocumentType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">论文</SelectItem>
                  <SelectItem value="patent">专利</SelectItem>
                  <SelectItem value="book">书籍</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>GB/T 类型</Label>
              <Select value={gbTag} onValueChange={(v) => v && setGbTag(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="J">期刊 [J]</SelectItem>
                  <SelectItem value="M">专著 [M]</SelectItem>
                  <SelectItem value="P">专利 [P]</SelectItem>
                  <SelectItem value="D">学位 [D]</SelectItem>
                  <SelectItem value="C">会议 [C]</SelectItem>
                  <SelectItem value="S">标准 [S]</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isPatent && (
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="bib-title">{isBook ? "书名" : "标题"}</Label>
              <Input
                id="bib-title"
                value={bib.title || ""}
                onChange={(e) => setBib((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
          )}

          {!isPatent && (
            <div className="grid gap-2">
              <Label htmlFor="bib-author">{isBook ? "作者" : "第一作者"}</Label>
              <Input
                id="bib-author"
                value={bib.firstAuthor || ""}
                onChange={(e) => setBib((prev) => ({ ...prev, firstAuthor: e.target.value }))}
              />
            </div>
          )}

          {isPatent && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="bib-patent">专利号</Label>
                <Input
                  id="bib-patent"
                  value={bib.patentNumber || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, patentNumber: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bib-inventor">发明人 / 申请人</Label>
                <Input
                  id="bib-inventor"
                  value={bib.inventors?.[0] || bib.applicant || ""}
                  onChange={(e) => setBib((prev) => ({
                    ...prev,
                    inventors: e.target.value ? [e.target.value] : [],
                    applicant: e.target.value,
                  }))}
                />
              </div>
            </>
          )}

          {!isPatent && !isBook && (
            <div className="grid gap-2">
              <Label htmlFor="bib-journal">期刊</Label>
              <Input
                id="bib-journal"
                value={bib.journal || ""}
                onChange={(e) => setBib((prev) => ({ ...prev, journal: e.target.value }))}
              />
            </div>
          )}

          {isBook && (
            <div className="grid gap-2">
              <Label htmlFor="bib-publisher">出版社</Label>
              <Input
                id="bib-publisher"
                value={bib.publisher || ""}
                onChange={(e) => setBib((prev) => ({ ...prev, publisher: e.target.value }))}
              />
            </div>
          )}

          {!isPatent && !isBook && (
            <div className="grid gap-3 lg:col-span-2 lg:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="bib-volume">卷</Label>
                <Input
                  id="bib-volume"
                  value={bib.volume || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, volume: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bib-issue">期</Label>
                <Input
                  id="bib-issue"
                  value={bib.issue || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, issue: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bib-pages">页码</Label>
                <Input
                  id="bib-pages"
                  value={bib.pages || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, pages: e.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-2">
            {!isPatent && (
              <div className="grid gap-2">
                <Label htmlFor="bib-year">年份</Label>
                <Input
                  id="bib-year"
                  type="number"
                  value={bib.year ?? ""}
                  onChange={(e) => setBib((prev) => ({
                    ...prev,
                    year: e.target.value ? Number(e.target.value) : undefined,
                  }))}
                />
              </div>
            )}
            {!isPatent && !isBook && (
              <div className="grid gap-2">
                <Label htmlFor="bib-doi">DOI</Label>
                <Input
                  id="bib-doi"
                  value={bib.doi || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, doi: e.target.value }))}
                  placeholder="10.xxxx/..."
                />
              </div>
            )}
          </div>

          {!isPatent && !isBook && (
            <div className="grid gap-3 lg:col-span-2 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="bib-issn">ISSN</Label>
                <Input
                  id="bib-issn"
                  value={bib.issn || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, issn: e.target.value }))}
                  placeholder="xxxx-xxxx"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bib-eissn">eISSN</Label>
                <Input
                  id="bib-eissn"
                  value={bib.eissn || ""}
                  onChange={(e) => setBib((prev) => ({ ...prev, eissn: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            保存书目
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
