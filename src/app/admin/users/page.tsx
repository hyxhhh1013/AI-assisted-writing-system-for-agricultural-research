"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Shield, ShieldOff, Search, Trash2, User, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { exportUsersCSV } from "@/lib/admin-export";
import {
  deleteAdminUser,
  listAdminUsers,
  updateAdminUserRole,
  type AdminUserRecord,
} from "@/services/admin";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listAdminUsers(q ? { q } : undefined)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    await updateAdminUserRole(userId, newRole);
    load();
    toast.success(`角色已切换为 ${newRole}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const d = await deleteAdminUser(deleteTarget.id);
      if (d.ok) { toast.success(d.message || "已删除"); load(); }
      else toast.error(d.error || "删除失败");
    } catch { toast.error("删除失败"); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#122820]">用户管理</h2>
        <Button variant="outline" size="sm" onClick={() => exportUsersCSV(users)} className="text-xs">导出 CSV</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa8a0]" />
        <Input className="pl-9 h-9 text-sm" placeholder="搜索姓名或邮箱..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>
      ) : (
        <div className="border border-[#1a5632]/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1a5632]/10 bg-[#faf9f6] text-left text-[#6b7c72]">
                <th className="py-2.5 px-4 font-medium">用户</th>
                <th className="py-2.5 px-4 font-medium">角色</th>
                <th className="py-2.5 px-4 font-medium hidden sm:table-cell">项目数</th>
                <th className="py-2.5 px-4 font-medium hidden sm:table-cell">注册时间</th>
                <th className="py-2.5 px-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.02]">
                  <td className="py-2.5 px-4">
                    <Link href={`/admin/users/${u.id}`} className="hover:underline">
                      <p className="font-medium text-[#122820]">{u.name}</p>
                      <p className="text-xs text-[#9aa8a0]">{u.email}</p>
                    </Link>
                  </td>
                  <td className="py-2.5 px-4">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px]">{u.role}</Badge>
                  </td>
                  <td className="py-2.5 px-4 hidden sm:table-cell text-[#6b7c72]">{u.projectCount}</td>
                  <td className="py-2.5 px-4 hidden sm:table-cell text-[#9aa8a0] text-xs">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleRole(u.id, u.role)} title={u.role === "admin" ? "降级" : "升级"}>
                        {u.role === "admin" ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Link href={`/admin/users/${u.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="h-3.5 w-3.5" /></Button></Link>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-[#9aa8a0] text-sm">暂无用户</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>确认删除用户</DialogTitle></DialogHeader>
          <div className="text-sm text-[#6b7c72] space-y-2">
            <p>即将删除 <strong className="text-[#122820]">{deleteTarget?.name}</strong>（{deleteTarget?.email}）</p>
            <p className="text-red-600 text-xs">此操作将删除该用户的所有项目、审查记录、查重记录，不可恢复。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认删除"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
