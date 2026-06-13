"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileUp, BookOpen } from "lucide-react";
import { DIALOG_FULL } from "@/components/ui/dialog-sizes";
import type { BibliographyImportPreviewRow } from "@/contracts/bib-import";
import { getKnowledgeDisplayTitle } from "@/contracts/knowledge";
import { commitBibliographyImport, previewBibliographyImport } from "@/services/knowledge";

interface KnowledgeBibliographyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onImported: () => void;
}

const ACTION_LABELS: Record<BibliographyImportPreviewRow["action"], string> = {
  create: "新建书目",
  merge: "合并到 PDF",
  skip: "跳过",
};

export function KnowledgeBibliographyImportDialog({
  open,
  onOpenChange,
  categories,
  onImported,
}: KnowledgeBibliographyImportDialogProps) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [category, setCategory] = useState("未分类");
  const [newCategory, setNewCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BibliographyImportPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const effectiveCategory =
    category === "__new__" ? newCategory.trim() || "未分类" : category;

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setRows([]);
    setSelected(new Set());
    setNewCategory("");
    setCategory("未分类");
  }, []);

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePreview = async () => {
    if (!file) {
      toast.error("请选择 .ris 或 .bib 文件");
      return;
    }
    setLoading(true);
    try {
      const preview = await previewBibliographyImport(file, effectiveCategory);
      setRows(preview.rows);
      const selectable = new Set(
        preview.rows.filter((r) => r.action !== "skip").map((r) => r.tempId),
      );
      setSelected(selectable);
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预览失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (tempId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tempId);
      else next.delete(tempId);
      return next;
    });
  };

  const handleImport = async () => {
    const items = rows
      .filter((row) => selected.has(row.tempId) && row.action !== "skip")
      .map((row) => ({
        tempId: row.tempId,
        action: row.action,
        bib: row.bib,
        documentType: row.documentType,
        suggestedName: row.suggestedName,
        targetName:
          row.action === "merge"
            ? row.pdfMatchName || row.duplicateName || row.suggestedName
            : undefined,
      }));

    if (items.length === 0) {
      toast.error("请至少选择一条可导入的书目");
      return;
    }

    setImporting(true);
    try {
      const result = await commitBibliographyImport(effectiveCategory, items);
      toast.success(
        result.message
          || `导入完成：新建 ${result.created}，合并 ${result.updated}，跳过 ${result.skipped}`,
      );
      handleClose(false);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const catOptions = categories.filter((c) => c !== "全部");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={DIALOG_FULL}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            导入书目（RIS / BibTeX）
          </DialogTitle>
          <DialogDescription>
            从 EndNote、Zotero 或知网导出文件批量导入书目。有 DOI 的条目将尝试 Crossref 补全；无 PDF 的记录标记为「待上传 PDF」。
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="bib-import-file">书目文件</Label>
              <Input
                id="bib-import-file"
                type="file"
                accept=".ris,.bib,.bibtex,.txt"
                className="mt-2"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label>目标分类</Label>
              <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {catOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ 新增分类</SelectItem>
                </SelectContent>
              </Select>
              {category === "__new__" && (
                <Input
                  className="mt-2"
                  placeholder="输入新分类名称"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 w-10" />
                  <th className="p-2 text-left">标题</th>
                  <th className="p-2 text-left w-28">动作</th>
                  <th className="p-2 text-left">关联</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const disabled = row.action === "skip";
                  const title = row.bib.title || row.suggestedName;
                  return (
                    <tr key={row.tempId} className="border-t">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(row.tempId)}
                          disabled={disabled}
                          onCheckedChange={(v) => toggleRow(row.tempId, v === true)}
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium line-clamp-2">{title}</div>
                        {row.bib.doi ? (
                          <div className="text-xs text-muted-foreground truncate">{row.bib.doi}</div>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Badge variant={disabled ? "secondary" : "outline"}>
                          {ACTION_LABELS[row.action]}
                        </Badge>
                        {row.skipReason ? (
                          <div className="text-xs text-muted-foreground mt-1">{row.skipReason}</div>
                        ) : null}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {row.pdfMatchName
                          ? getKnowledgeDisplayTitle({ name: row.pdfMatchName, bib: null })
                          : row.action === "create"
                            ? "待上传 PDF"
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "preview" ? (
            <Button variant="outline" onClick={() => setStep("upload")} disabled={importing}>
              上一步
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading || importing}>
            取消
          </Button>
          {step === "upload" ? (
            <Button onClick={handlePreview} disabled={loading || !file}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              解析预览
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认导入 ({selected.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
