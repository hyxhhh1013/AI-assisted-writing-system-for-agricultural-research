"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Database,
  ArrowLeft,
  Activity,
  Search,
  Shield,
  Heart,
  Settings,
  Compass,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminGlobalSearch } from "@/components/admin/admin-global-search";

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
      { href: "/admin/directions", label: "研究方向", icon: Compass },
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
      { href: "/admin/agent-sessions", label: "Agent 会话", icon: Bot },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f6f8f7]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[#1a5632]/10 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-[#1a5632]/10 px-4">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-[#6b7c72] hover:text-[#1a5632]">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回工作台
          </Link>
        </div>
        <div className="border-b border-[#1a5632]/8 px-4 py-4">
          <p className="text-sm font-semibold text-[#1a5632]">禾书耕文</p>
          <p className="mt-0.5 text-xs text-[#9aa8a0]">运维控制台</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1.5 text-[10px] font-medium text-[#9aa8a0]">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-[#1a5632] font-medium text-white"
                          : "text-[#3d4f46] hover:bg-[#1a5632]/6 hover:text-[#1a5632]",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#1a5632]/10 bg-white px-6">
          <p className="text-sm text-[#6b7c72]">
            禾书耕文 <span className="text-[#9aa8a0]">/</span> <span className="text-[#122820]">后台管理</span>
          </p>
          <AdminGlobalSearch />
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
