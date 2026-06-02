"use client";

import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGoBack } from "@/contexts/navigation-history";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** 无浏览历史时的兜底路由 */
  backHref?: string;
  /** 为 true 时忽略历史栈，始终跳转 backHref */
  backForceFallback?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  backHref = "/",
  backForceFallback = false,
  actions,
  className,
}: PageHeaderProps) {
  const goBack = useGoBack();

  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0 text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]"
          onClick={() => goBack(backHref, { forceFallback: backForceFallback })}
          title="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#122820] sm:text-2xl">
            {Icon ? <Icon className="h-5 w-5 text-[#1a5632]" /> : null}
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-[#6b7c72]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}
