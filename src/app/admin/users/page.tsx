"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldOff, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { exportUsersCSV } from "@/lib/admin-export";
import { deleteAdminUser, listAdminUsers, updateAdminUserRole, type AdminUserRecord } from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { adminRoleLabel } from "@/lib/admin-labels";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";
import { AdminDataTable } from "@/components/admin/admin-data-table";

export default function AdminUsersPage() {
  const {
    q,
    setQ,
    page,
    setPage,
    sortBy,
    sortOrder,
    toggleSort,
    data: users,
    meta,
    loading,
    reload,
  } = useAdminList({
    fetcher: listAdminUsers,
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    urlSync: true,
  });

  const [deleteTarget, setDeleteTarget] = useState<AdminUserRecord | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [roleChanging, setRoleChanging] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const d = await deleteAdminUser(deleteTarget.id);
      if (d.ok) { toast.success(d.message || "已删除"); reload(); }
      else toast.error(d.error || "删除失败");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    const newRole = roleTarget.role === "admin" ? "user" : "admin";
    setRoleChanging(true);
    try {
      await updateAdminUserRole(roleTarget.id, newRole);
      toast.success(`角色已切换为 ${adminRoleLabel(newRole)}`);
      reload();
    } catch {
      toast.error("角色切换失败");
    } finally {
      setRoleChanging(false);
      setRoleTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="用户管理"
        actions={
          <Button variant="outline" size="sm" onClick={() => exportUsersCSV(users)} className="text-xs">
            导出 CSV
          </Button>
        }
      />

      <AdminSearchInput value={q} onChange={setQ} placeholder="搜索姓名或邮箱..." />

      <AdminDataTable
        columns={[
          {
            key: "name",
            header: "用户",
            sortable: true,
            cell: (u) => (
              <Link href={`/admin/users/${u.id}`} className="hover:underline">
                <p className="font-medium text-[#122820]">{u.name}</p>
                <p className="text-xs text-[#9aa8a0]">{u.email}</p>
              </Link>
            ),
          },
          {
            key: "role",
            header: "角色",
            sortable: true,
            cell: (u) => (
              <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px]">
                {adminRoleLabel(u.role)}
              </Badge>
            ),
          },
          {
            key: "projectCount",
            header: "项目数",
            hideOnMobile: true,
            cell: (u) => <span className="text-[#6b7c72]">{u.projectCount}</span>,
          },
          {
            key: "createdAt",
            header: "注册时间",
            sortable: true,
            hideOnMobile: true,
            cell: (u) => (
              <span className="text-[#9aa8a0] text-xs">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</span>
            ),
          },
          {
            key: "actions",
            header: "操作",
            cell: (u) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setRoleTarget(u)}
                  title={u.role === "admin" ? "降为普通用户" : "升为管理员"}
                  aria-label={u.role === "admin" ? "降为普通用户" : "升为管理员"}
                >
                  {u.role === "admin" ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-700"
                  onClick={() => setDeleteTarget(u)}
                  title="删除用户"
                  aria-label="删除用户"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Link href={`/admin/users/${u.id}`}>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="查看详情" aria-label="查看详情">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ),
          },
        ]}
        data={users}
        rowKey={(u) => u.id}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={toggleSort}
        emptyTitle="暂无用户"
        emptyDescription="用户注册后将显示在此列表。"
      />

      <AdminPagination meta={meta} onPageChange={setPage} />

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除用户"
        destructive
        loading={deleting}
        confirmLabel="确认删除"
        description={
          <>
            <p>即将删除 <strong className="text-[#122820]">{deleteTarget?.name}</strong>（{deleteTarget?.email}）</p>
            <p className="text-red-600 text-xs mt-2">此操作将删除该用户的所有项目、审查记录、查重记录，不可恢复。</p>
          </>
        }
        onConfirm={handleDelete}
      />

      <AdminConfirmDialog
        open={!!roleTarget}
        onOpenChange={(open) => !open && setRoleTarget(null)}
        title="确认切换角色"
        loading={roleChanging}
        confirmLabel="确认切换"
        description={
          <p>
            将 <strong>{roleTarget?.name}</strong> 的角色从
            <Badge className="mx-1 text-[10px]">{roleTarget ? adminRoleLabel(roleTarget.role) : ""}</Badge>
            切换为
            <Badge className="mx-1 text-[10px]">
              {roleTarget ? adminRoleLabel(roleTarget.role === "admin" ? "user" : "admin") : ""}
            </Badge>
            ？
          </p>
        }
        onConfirm={handleRoleChange}
      />
    </div>
  );
}
