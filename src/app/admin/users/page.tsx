"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  projectCount: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => { setUsers(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    if (res.ok) {
      toast.success(`已${newRole === "admin" ? "设为管理员" : "取消管理员"}`);
      load();
    } else {
      toast.error("操作失败");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-[#122820]">用户管理</h1>

      <div className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a5632]/10 bg-[#f8f7f4]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                姓名
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                邮箱
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                角色
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                项目数
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                注册时间
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#6b7c72]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#1a5632]/5 last:border-0">
                <td className="px-4 py-2.5 font-medium text-[#122820]">
                  {u.name || "—"}
                </td>
                <td className="px-4 py-2.5 text-[#3d4f46]">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      u.role === "admin"
                        ? "bg-[#1a5632]/10 text-[#1a5632]"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {u.role === "admin" ? "管理员" : "普通用户"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[#3d4f46]">{u.projectCount}</td>
                <td className="px-4 py-2.5 text-xs text-[#9aa8a0]">
                  {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => void toggleRole(u.id, u.role)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#6b7c72] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
                  >
                    {u.role === "admin" ? (
                      <>
                        <ShieldOff className="h-3 w-3" />
                        取消管理员
                      </>
                    ) : (
                      <>
                        <Shield className="h-3 w-3" />
                        设为管理员
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无用户</p>
        )}
      </div>
    </div>
  );
}
