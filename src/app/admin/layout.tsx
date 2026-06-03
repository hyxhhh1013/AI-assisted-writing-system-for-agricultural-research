"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, FileText, Database, ArrowLeft, Loader2, Activity, Search, Shield, Heart, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "概览",
    items: [
      { href: "/admin", label: "仪表盘", icon: LayoutDashboard },
      { href: "/admin/health", label: "系统健康", icon: Heart },
      { href: "/admin/settings", label: "系统设置", icon: Settings },
    ],
  },
  {
    label: "内容",
    items: [
      { href: "/admin/users", label: "用户管理", icon: Users },
      { href: "/admin/projects", label: "项目管理", icon: FileText },
      { href: "/admin/knowledge", label: "文献管理", icon: Database },
    ],
  },
  {
    label: "质量",
    items: [
      { href: "/admin/reviews", label: "审查记录", icon: Shield },
      { href: "/admin/plagiarism", label: "查重记录", icon: Search },
    ],
  },
  {
    label: "数据",
    items: [
      { href: "/admin/usage", label: "使用统计", icon: Activity },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) { router.replace("/login?redirect=/admin"); }
      else if (user.role !== "admin") { router.replace("/"); }
      else { setChecked(true); }
    }
  }, [user, loading, router]);

  if (loading || !checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#faf9f6]">
      <aside className="flex w-56 flex-col border-r border-[#1a5632]/10 bg-white">
        <div className="flex h-12 items-center gap-2 border-b border-[#1a5632]/10 px-4">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-[#6b7c72] hover:text-[#1a5632]">
            <ArrowLeft className="h-3.5 w-3.5" />返回首页
          </Link>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a5632]/50">Admin</p>
          <p className="text-sm font-semibold text-[#122820]">后台管理</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 space-y-4">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-[#9aa8a0]">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const active = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        active ? "bg-[#1a5632] text-white" : "text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
                      )}
                    >
                      <item.icon className="h-4 w-4" />{item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
