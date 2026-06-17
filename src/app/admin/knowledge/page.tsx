"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AdminListParams } from "@/contracts/admin";
import {
  bulkDeleteAdminKnowledge,
  deleteAdminKnowledge,
  importAdminJournalMetrics,
  listAdminKnowledge,
  type AdminKnowledgeFile,
} from "@/services/admin";
import { reindexKnowledgeStream } from "@/services/knowledge";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { KnowledgeIndexBadge } from "@/components/shared/knowledge/knowledge-index-badge";

const INDEX_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "ready", label: "已索引" },
  { value: "partial", label: "待完善" },
  { value: "unindexed", label: "未索引" },
];

export default function AdminKnowledgePage() {
  const [cat, setCat] = useState("");
  const [indexStatus, setIndexStatus] = useState("");
  const [cats, setCats] = useState<{ category: string; count: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AdminKnowledgeFile | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [bulkReindexing, setBulkReindexing] = useState(false);
  const [metricsImporting, setMetricsImporting] = useState(false);
  const [pendingMetricsFile, setPendingMetricsFile] = useState<File | null>(null);
  const [metricsDryRun, setMetricsDryRun] = useState(false);
  const reindexAbortRef = useRef<AbortController | null>(null);

  const listFilters = useMemo(
    () => ({
      category: cat || undefined,
      indexStatus: indexStatus || undefined,
    }),
    [cat, indexStatus],
  );

  const knowledgeFetcher = useCallback(
    async (params: AdminListParams) => {
      const result = await listAdminKnowledge(params);
      setCats(result.categoryStats);
      return { data: result.data, meta: result.meta };
    },
    [],
  );

  const {
    q,
    setQ,
    page,
    setPage,
    sortBy,
    sortOrder,
    toggleSort,
    data: files,
    meta,
    loading,
    reload,
  } = useAdminList({
    fetcher: knowledgeFetcher,
    filters: listFilters,
    defaultSortBy: "name",
    defaultSortOrder: "asc",
  });

  const runReindex = async (names: string[], label?: string) => {
    if (names.length === 0) return;
    reindexAbortRef.current?.abort();
    const controller = new AbortController();
    reindexAbortRef.current = controller;

    if (names.length === 1) setReindexing(names[0]);
    else setBulkReindexing(true);

    toast.info(label || `正在重索引 ${names.length} 篇文献…`);

    try {
      for (const name of names) {
        if (controller.signal.aborted) break;
        await reindexKnowledgeStream(
          (event) => {
            if (event.type === "error") throw new Error(event.message);
          },
          controller.signal,
          { files: [name] },
        );
      }
      toast.success("重索引完成");
      reload();
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const msg = error instanceof Error ? error.message : "重索引失败";
        toast.error(msg);
      }
    } finally {
      setReindexing(null);
      setBulkReindexing(false);
      reindexAbortRef.current = null;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteAdminKnowledge(deleteTarget.name, deleteTarget.category);
    if (ok) { toast.success("已删除"); reload(); }
    else toast.error("删除失败");
    setDeleteTarget(null);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const toDelete = files.filter((f) => selected.has(f.id)).map((f) => ({ name: f.name, category: f.category }));
    const ok = await bulkDeleteAdminKnowledge(toDelete);
    if (ok) { toast.success(`已删除 ${toDelete.length} 篇`); setSelected(new Set()); reload(); }
    else toast.error("批量删除失败");
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
  };

  const runMetricsImport = async () => {
    if (!pendingMetricsFile) return;
    setMetricsImporting(true);
    try {
      const result = await importAdminJournalMetrics(pendingMetricsFile, { dryRun: metricsDryRun });
      if (!result.ok) {
        toast.error(result.error ?? "导入失败");
        return;
      }
      const parts = [
        result.message,
        result.matched !== undefined ? `匹配 ${result.matched}` : null,
        result.updated !== undefined ? `更新 ${result.updated}` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || (metricsDryRun ? "试运行完成" : "指标已导入"));
    } catch {
      toast.error("导入失败");
    } finally {
      setMetricsImporting(false);
      setPendingMetricsFile(null);
      setMetricsDryRun(false);
    }
  };

  const queueMetricsImport = (file: File | undefined, dryRun: boolean) => {
    if (!file) return;
    setPendingMetricsFile(file);
    setMetricsDryRun(dryRun);
  };

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map((f) => f.id)));
  };

  const selectedNames = files.filter((f) => selected.has(f.id)).map((f) => f.name);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] p-4 space-y-2">
        <p className="text-sm font-medium text-[#122820]">期刊指标表（CSV / Excel）</p>
        <p className="text-xs text-[#6b7c72]">
          直接上传课题组 Excel 即可；列名支持中英文（如 issn/刊号、journal/刊名、影响因子、分区）。优先 ISSN 匹配，否则刊名。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="h-9 max-w-xs text-sm"
            disabled={metricsImporting}
            onChange={(e) => {
              queueMetricsImport(e.target.files?.[0], false);
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
              input.accept = ".csv,.xlsx,.xls,text/csv";
              input.onchange = () => queueMetricsImport(input.files?.[0], true);
              input.click();
            }}
          >
            {metricsImporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            试运行
          </Button>
        </div>
      </div>

      <AdminPageHeader
        title="文献管理"
        actions={
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkReindexing}
                  onClick={() => void runReindex(selectedNames, `批量重索引 ${selectedNames.length} 篇`)}
                >
                  {bulkReindexing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  重索引 ({selected.size})
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setBulkConfirmOpen(true)} disabled={bulkDeleting}>
                  删除选中 ({selected.size})
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AdminSearchInput value={q} onChange={setQ} placeholder="搜索文件名..." />
        <div className="flex gap-1 flex-wrap">
          {INDEX_STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value || "all"}
              variant={indexStatus === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-8 text-[10px]"
              onClick={() => setIndexStatus(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {["", ...cats.slice(0, 8).map((c) => c.category)].map((c) => (
          <Button key={c || "all"} variant={cat === c ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setCat(c)}>
            {c || "全部分类"}
          </Button>
        ))}
      </div>

      <AdminDataTable
        columns={[
          {
            key: "select",
            header: <Checkbox checked={selected.size === files.length && files.length > 0} onCheckedChange={toggleAll} />,
            className: "w-8",
            cell: (f) => <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggleSelect(f.id)} />,
          },
          {
            key: "name",
            header: "文件名",
            sortable: true,
            cell: (f) => (
              <div className="max-w-[250px]">
                <p className="truncate font-medium text-[#122820]">{f.name}</p>
                <p className="text-[10px] text-[#9aa8a0]">{(f.size / 1024).toFixed(0)} KB{f.doi ? ` · DOI ${f.doi}` : ""}</p>
              </div>
            ),
          },
          {
            key: "category",
            header: "分类",
            sortable: true,
            hideOnMobile: true,
            cell: (f) => <Badge variant="outline" className="text-[10px]">{f.category}</Badge>,
          },
          {
            key: "indexStatus",
            header: "索引",
            hideOnMobile: true,
            cell: (f) => (
              <KnowledgeIndexBadge
                file={{
                  chunkCount: f.chunkCount,
                  bib: f.doi ? { doi: f.doi } : null,
                  bibEdited: f.bibEdited,
                  documentType: f.documentType,
                  parseWarning: f.parseWarning,
                }}
              />
            ),
          },
          {
            key: "chunkCount",
            header: "分块",
            sortable: true,
            hideOnMobile: true,
            cell: (f) => <span className="text-[#6b7c72]">{f.chunkCount}</span>,
          },
          {
            key: "actions",
            header: "操作",
            cell: (f) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void runReindex([f.name], `重索引：${f.name}`)}
                  disabled={reindexing === f.name || bulkReindexing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reindexing === f.name ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(f)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]}
        data={files}
        rowKey={(f) => f.id}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={toggleSort}
        emptyTitle="暂无文献"
        emptyDescription="上传 PDF 到知识库目录，或从工作台导入外部文献。"
        emptyAction={
          <Link href="/knowledge">
            <Button variant="outline" size="sm">前往知识库</Button>
          </Link>
        }
      />

      <AdminPagination meta={meta} onPageChange={setPage} />

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除"
        destructive
        confirmLabel="确认删除"
        description={<p>删除「{deleteTarget?.name}」及其所有文本块。</p>}
        onConfirm={handleDelete}
      />

      <AdminConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="确认批量删除"
        destructive
        loading={bulkDeleting}
        confirmLabel="确认删除"
        description={<p>将删除选中的 {selected.size} 篇文献及其索引，不可恢复。</p>}
        onConfirm={handleBulkDelete}
      />

      <AdminConfirmDialog
        open={!!pendingMetricsFile}
        onOpenChange={(open) => !open && setPendingMetricsFile(null)}
        title={metricsDryRun ? "试运行期刊指标导入" : "确认导入期刊指标"}
        loading={metricsImporting}
        confirmLabel={metricsDryRun ? "开始试运行" : "确认导入"}
        description={
          <p>
            {metricsDryRun ? "试运行" : "导入"}文件 <strong>{pendingMetricsFile?.name}</strong>？
            将按 ISSN / 刊名匹配知识库文献并{metricsDryRun ? "预览" : "写入"}期刊指标。
          </p>
        }
        onConfirm={runMetricsImport}
      />
    </div>
  );
}
