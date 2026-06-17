"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { exportProjectsCSV } from "@/lib/admin-export";
import { adminModeLabel, adminTplLabel } from "@/lib/admin-labels";
import { deleteAdminProject, listAdminProjects, type AdminProjectRecord } from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";

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
  const [tpl, setTpl] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectRecord | null>(null);

  const listFilters = useMemo(
    () => ({ template: tpl || undefined, mode: modeFilter || undefined }),
    [tpl, modeFilter],
  );

  const { q, setQ, page, setPage, data: projects, meta, loading, reload } = useAdminList({
    fetcher: listAdminProjects,
    filters: listFilters,
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
        actions={
          <Button variant="outline" size="sm" onClick={() => exportProjectsCSV(projects)} className="text-xs">
            导出 CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AdminSearchInput value={q} onChange={setQ} placeholder="搜索标题..." />
        <AdminFilterPills value={tpl} options={TPL_OPTIONS} onChange={setTpl} />
        <AdminFilterPills value={modeFilter} options={MODE_OPTIONS} onChange={setModeFilter} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>
      ) : (
        <>
          <div className="border border-[#1a5632]/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]">
                  <th className="py-2.5 px-4 font-medium">标题</th>
                  <th className="py-2.5 px-4 font-medium hidden sm:table-cell">作者</th>
                  <th className="py-2.5 px-4 font-medium hidden md:table-cell">模板</th>
                  <th className="py-2.5 px-4 font-medium hidden md:table-cell">模式</th>
                  <th className="py-2.5 px-4 font-medium">章节</th>
                  <th className="py-2.5 px-4 font-medium hidden lg:table-cell">大纲</th>
                  <th className="py-2.5 px-4 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                    <td className="py-2.5 px-4 max-w-[200px]">
                      <p className="truncate font-medium text-[#122820]">{p.title || "未命名"}</p>
                      <p className="text-[10px] text-[#9aa8a0]">{new Date(p.lastUpdated).toLocaleDateString("zh-CN")}</p>
                    </td>
                    <td className="py-2.5 px-4 hidden sm:table-cell text-[#6b7c72]">{p.userName}</td>
                    <td className="py-2.5 px-4 hidden md:table-cell"><Badge variant="outline" className="text-[10px]">{adminTplLabel(p.template)}</Badge></td>
                    <td className="py-2.5 px-4 hidden md:table-cell"><Badge variant="secondary" className="text-[10px]">{adminModeLabel(p.mode)}</Badge></td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-[#1a5632]/10 overflow-hidden"><div className="h-full rounded-full bg-[#1a5632]" style={{ width: `${p.progress}%` }} /></div>
                        <span className="text-xs text-[#9aa8a0]">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      {p.outlineTasksTotal > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 rounded-full bg-blue-500/10 overflow-hidden"><div className="h-full rounded-full bg-blue-500/70" style={{ width: `${p.outlineProgress}%` }} /></div>
                          <span className="text-[10px] text-[#9aa8a0] tabular-nums">{p.outlineTasksDone}/{p.outlineTasksTotal}</span>
                        </div>
                      ) : <span className="text-[10px] text-[#9aa8a0]">—</span>}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <Link href={`/workbench?id=${p.id}`} target="_blank"><Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button></Link>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[#9aa8a0] text-sm">暂无项目</td></tr>}
              </tbody>
            </table>
          </div>
          <AdminPagination meta={meta} onPageChange={setPage} />
        </>
      )}

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
