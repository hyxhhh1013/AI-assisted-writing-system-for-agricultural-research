"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Trash2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  bulkDeleteAdminKnowledge,
  deleteAdminKnowledge,
  importAdminJournalMetrics,
  listAdminKnowledge,
  reindexAdminKnowledge,
  type AdminKnowledgeFile,
} from "@/services/admin";

export default function AdminKnowledgePage() {
  const [files, setFiles] = useState<AdminKnowledgeFile[]>([]);
  const [cats, setCats] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AdminKnowledgeFile | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [metricsImporting, setMetricsImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listAdminKnowledge({ q: q || undefined, category: cat || undefined })
      .then(({ files: f, categoryStats }) => {
        setFiles(f);
        setCats(categoryStats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, cat]);
  useEffect(() => { load(); }, [load]);

  const handleReindex = async (f: AdminKnowledgeFile) => {
    setReindexing(f.name);
    try {
      const ok = await reindexAdminKnowledge(f.name, f.category);
      if (ok) toast.success(`已触发重索引：${f.name}`);
      else toast.error("重索引失败");
    } catch { toast.error("重索引失败"); }
    setReindexing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteAdminKnowledge(deleteTarget.name, deleteTarget.category);
    if (ok) { toast.success("已删除"); load(); }
    else toast.error("删除失败");
    setDeleteTarget(null);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const toDelete = files.filter(f => selected.has(f.id)).map(f => ({ name: f.name, category: f.category }));
    const ok = await bulkDeleteAdminKnowledge(toDelete);
    if (ok) { toast.success(`已删除 ${toDelete.length} 篇`); setSelected(new Set()); load(); }
    else toast.error("批量删除失败");
    setBulkDeleting(false);
  };

  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => { if (selected.size === files.length) setSelected(new Set()); else setSelected(new Set(files.map(f => f.id))); };

  const handleMetricsImport = async (file: File | undefined, dryRun: boolean) => {
    if (!file) return;
    setMetricsImporting(true);
    try {
      const result = await importAdminJournalMetrics(file, { dryRun });
      if (!result.ok) {
        toast.error(result.error ?? "导入失败");
        return;
      }
      toast.success(result.message ?? (dryRun ? "试运行完成" : "指标已导入"));
    } catch {
      toast.error("导入失败");
    } finally {
      setMetricsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] p-4 space-y-2">
        <p className="text-sm font-medium text-[#122820]">期刊指标 CSV（ISSN → IF/分区）</p>
        <p className="text-xs text-[#6b7c72]">
          列：issn, impactFactor, impactFactorYear, jcrQuartile, casPartition, isCoreJournal。匹配文献 bib.issn / eissn 后写入 metrics。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".csv,text/csv"
            className="h-9 max-w-xs text-sm"
            disabled={metricsImporting}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleMetricsImport(f, false);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={metricsImporting}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv,text/csv";
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) void handleMetricsImport(f, true);
              };
              input.click();
            }}
          >
            {metricsImporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            试运行
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#122820]">文献管理</h2>
        {selected.size > 0 && <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>删除选中 ({selected.size})</Button>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa8a0]" /><Input className="pl-9 h-9 text-sm" placeholder="搜索文件名..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="flex gap-1">{["", ...cats.slice(0, 6).map(c => c.category)].map(c => <Button key={c} variant={cat === c ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setCat(c)}>{c || "全部"}</Button>)}</div>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div> : (
        <div className="border border-[#1a5632]/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]"><th className="py-2.5 px-4 font-medium w-8"><Checkbox checked={selected.size === files.length && files.length > 0} onCheckedChange={toggleAll} /></th><th className="py-2.5 px-4 font-medium">文件名</th><th className="py-2.5 px-4 font-medium hidden sm:table-cell">分类</th><th className="py-2.5 px-4 font-medium hidden sm:table-cell">分块</th><th className="py-2.5 px-4 font-medium">操作</th></tr></thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                  <td className="py-2.5 px-4"><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggleSelect(f.id)} /></td>
                  <td className="py-2.5 px-4 max-w-[250px]"><p className="truncate font-medium text-[#122820]">{f.name}</p><p className="text-[10px] text-[#9aa8a0]">{(f.size / 1024).toFixed(0)} KB</p></td>
                  <td className="py-2.5 px-4 hidden sm:table-cell"><Badge variant="outline" className="text-[10px]">{f.category}</Badge></td>
                  <td className="py-2.5 px-4 hidden sm:table-cell text-[#6b7c72]">{f.chunkCount}</td>
                  <td className="py-2.5 px-4"><div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReindex(f)} disabled={reindexing === f.name}><RefreshCw className={`h-3.5 w-3.5 ${reindexing === f.name ? "animate-spin" : ""}`} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div></td>
                </tr>
              ))}
              {files.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-[#9aa8a0] text-sm">暂无文献</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader><p className="text-sm text-[#6b7c72]">删除「{deleteTarget?.name}」及其所有文本块。</p><DialogFooter><Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="destructive" size="sm" onClick={handleDelete}>确认删除</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
