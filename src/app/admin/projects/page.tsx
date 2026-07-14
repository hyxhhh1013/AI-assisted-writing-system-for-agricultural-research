"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { exportProjectsCSV } from "@/lib/admin-export";
import { adminModeLabel, adminTplLabel } from "@/lib/admin-labels";
import { deleteAdminProject, listAdminProjects, type AdminProjectRecord } from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminProgressArc } from "@/components/admin/admin-progress-arc";

const TPL_OPTIONS = [
  { value: "", label: "全部模板" },
  { value: "sci", label: "SCI" },
  { value: "ieee", label: "IEEE" },
  { value: "gbt7713", label: "GB/T 7713" },
  { value: "nature", label: "Nature" },
];

const MODE_OPTIONS = [
  { value: "", label: "全部模式" },
  { value: "review", label: "综述" },
  { value: "research", label: "研究" },
];

export default function AdminProjectsPage() {
  const searchParams = useSearchParams();
  const [tpl, setTpl] = useState(() => searchParams.get("template") ?? "");
  const [modeFilter, setModeFilter] = useState(() => searchParams.get("mode") ?? "");
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectRecord | null>(null);

  const listFilters = useMemo(
    () => ({ template: tpl || undefined, mode: modeFilter || undefined }),
    [tpl, modeFilter],
  );

  const {
    q,
    setQ,
    page,
    setPage,
    sortBy,
    sortOrder,
    toggleSort,
    data: projects,
    meta,
    loading,
    reload,
  } = useAdminList({
    fetcher: listAdminProjects,
    filters: listFilters,
    urlSync: true,
    defaultSortBy: "lastUpdated",
    defaultSortOrder: "desc",
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const d = await deleteAdminProject(deleteTarget.id);
    if (d.ok) { toast.success("已删除"); reload(); setDeleteTarget(null); }
    else toast.error(d.error || "删除失败");
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="项目管理"
        subtitle={`共 ${meta.total} 个项目`}
        actions={
          <Button variant="outline" size="sm" onClick={() => exportProjectsCSV(projects)} className="text-xs bg-white/70">
            导出 CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AdminSearchInput value={q} onChange={setQ} placeholder="搜索标题..." />
        <AdminFilterPills value={tpl} options={TPL_OPTIONS} onChange={setTpl} />
        <AdminFilterPills value={modeFilter} options={MODE_OPTIONS} onChange={setModeFilter} />
      </div>

      <AdminDataTable
        columns={[
          {
            key: "title",
            header: "标题",
            sortable: true,
            cell: (p) => (
              <div className="max-w-[220px]">
                <p className="truncate font-medium text-[#122820]">{p.title || "未命名"}</p>
                <p className="text-[10px] text-[#9aa8a0]">{new Date(p.lastUpdated).toLocaleDateString("zh-CN")}</p>
              </div>
            ),
          },
          {
            key: "userName",
            header: "作者",
            hideOnMobile: true,
            cell: (p) => <span className="text-[#6b7c72]">{p.userName}</span>,
          },
          {
            key: "template",
            header: "模板",
            sortable: true,
            hideOnMobile: true,
            cell: (p) => <Badge variant="outline" className="text-[10px]">{adminTplLabel(p.template)}</Badge>,
          },
          {
            key: "mode",
            header: "模式",
            sortable: true,
            hideOnMobile: true,
            cell: (p) => <Badge variant="secondary" className="text-[10px]">{adminModeLabel(p.mode)}</Badge>,
          },
          {
            key: "progress",
            header: "章节",
            cell: (p) => <AdminProgressArc value={p.progress} color="#1a5632" />,
          },
          {
            key: "outline",
            header: "大纲",
            hideOnMobile: true,
            cell: (p) => (
              p.outlineTasksTotal > 0 ? (
                <AdminProgressArc value={p.outlineProgress} color="#3b82f6" size={32} />
              ) : <span className="text-[10px] text-[#9aa8a0]">—</span>
            ),
          },
          {
            key: "actions",
            header: "操作",
            cell: (p) => (
              <div className="flex items-center gap-1">
                <Link href={`/workbench?id=${p.id}`} target="_blank">
                  <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                </Link>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]}
        data={projects}
        rowKey={(p) => p.id}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={toggleSort}
        emptyTitle="暂无项目"
        emptyDescription="用户在工作台创建项目后将显示在此。"
      />

      <AdminPagination meta={meta} onPageChange={setPage} />

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除"
        destructive
        confirmLabel="确认删除"
        description={<p>删除「{deleteTarget?.title}」及所有关联数据，不可恢复。</p>}
        onConfirm={handleDelete}
      />
    </div>
  );
}
