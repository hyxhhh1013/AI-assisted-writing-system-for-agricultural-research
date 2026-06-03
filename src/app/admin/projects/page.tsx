"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { exportProjectsCSV } from "@/lib/admin-export";
import { deleteAdminProject, listAdminProjects, type AdminProjectRecord } from "@/services/admin";

const TPLS = ["", "sci", "ieee", "gbt7713", "nature"];
const TPL_LABEL: Record<string, string> = { sci: "SCI", ieee: "IEEE", gbt7713: "GB/T 7713", nature: "Nature" };
const MODES = ["", "review", "research"] as const;
const MODE_LABEL: Record<string, string> = { review: "综述", research: "研究" };

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tpl, setTpl] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectRecord | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listAdminProjects({
      q: q || undefined,
      template: tpl || undefined,
      mode: modeFilter || undefined,
    })
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, tpl, modeFilter]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const d = await deleteAdminProject(deleteTarget.id);
    if (d.ok) { toast.success("已删除"); load(); setDeleteTarget(null); }
    else toast.error(d.error || "删除失败");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#122820]">项目管理</h2>
        <Button variant="outline" size="sm" onClick={() => exportProjectsCSV(projects)} className="text-xs">导出 CSV</Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa8a0]" /><Input className="pl-9 h-9 text-sm" placeholder="搜索标题..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="flex flex-wrap gap-1">
          {TPLS.map(t => <Button key={t || "all-tpl"} variant={tpl === t ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setTpl(t)}>{t ? TPL_LABEL[t] || t : "全部模板"}</Button>)}
        </div>
        <div className="flex gap-1">
          {MODES.map(m => <Button key={m || "all-mode"} variant={modeFilter === m ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setModeFilter(m)}>{m ? MODE_LABEL[m] : "全部模式"}</Button>)}
        </div>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div> : (
        <div className="border border-[#1a5632]/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]"><th className="py-2.5 px-4 font-medium">标题</th><th className="py-2.5 px-4 font-medium hidden sm:table-cell">作者</th><th className="py-2.5 px-4 font-medium hidden md:table-cell">模板</th><th className="py-2.5 px-4 font-medium hidden md:table-cell">模式</th><th className="py-2.5 px-4 font-medium">章节</th><th className="py-2.5 px-4 font-medium hidden lg:table-cell">大纲</th><th className="py-2.5 px-4 font-medium">操作</th></tr></thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                  <td className="py-2.5 px-4 max-w-[200px]"><p className="truncate font-medium text-[#122820]">{p.title || "未命名"}</p><p className="text-[10px] text-[#9aa8a0]">{new Date(p.lastUpdated).toLocaleDateString("zh-CN")}</p></td>
                  <td className="py-2.5 px-4 hidden sm:table-cell text-[#6b7c72]">{p.userName}</td>
                  <td className="py-2.5 px-4 hidden md:table-cell"><Badge variant="outline" className="text-[10px]">{TPL_LABEL[p.template] || p.template}</Badge></td>
                  <td className="py-2.5 px-4 hidden md:table-cell"><Badge variant="secondary" className="text-[10px]">{MODE_LABEL[p.mode] || p.mode || "综述"}</Badge></td>
                  <td className="py-2.5 px-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-[#1a5632]/10 overflow-hidden"><div className="h-full rounded-full bg-[#1a5632]" style={{ width: `${p.progress}%` }} /></div><span className="text-xs text-[#9aa8a0]">{p.progress}%</span></div></td>
                  <td className="py-2.5 px-4 hidden lg:table-cell">
                    {p.outlineTasksTotal > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-blue-500/10 overflow-hidden"><div className="h-full rounded-full bg-blue-500/70" style={{ width: `${p.outlineProgress}%` }} /></div>
                        <span className="text-[10px] text-[#9aa8a0] tabular-nums">{p.outlineTasksDone}/{p.outlineTasksTotal}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#9aa8a0]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4"><div className="flex items-center gap-1"><Link href={`/workbench?id=${p.id}`} target="_blank"><Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button></Link><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
                </tr>
              ))}
              {projects.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[#9aa8a0] text-sm">暂无项目</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader><p className="text-sm text-[#6b7c72]">删除「{deleteTarget?.title}」及所有关联数据，不可恢复。</p><DialogFooter><Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="destructive" size="sm" onClick={handleDelete}>确认删除</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
