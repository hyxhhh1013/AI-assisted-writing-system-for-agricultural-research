"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Play, LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { LabLogo } from "@/components/home/lab-logo";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/guide", label: "使用指南", icon: BookOpen },
  { href: "/presentation", label: "演示文档", icon: Play },
] as const;

export function HomeTopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#1a5632]/8 bg-[#f6f5f1]/85 backdrop-blur-lg">
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-4 sm:px-6">
        <LabLogo size="md" />

        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[#3d4f46] transition-colors hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
            >
              <Icon className="h-4 w-4 opacity-70" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}

          {user ? (
            <div className="flex items-center gap-1 ml-1">
              <span className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[#3d4f46]">
                <User className="h-4 w-4 opacity-70" />
                <span className="hidden sm:inline">{user.name || user.email}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full text-xs text-[#6b7c72] hover:text-[#1a5632]"
                onClick={() => void handleLogout()}
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                退出
              </Button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1a5632] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#144a2a]"
            >
              <LogIn className="h-4 w-4" />
              登录
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
