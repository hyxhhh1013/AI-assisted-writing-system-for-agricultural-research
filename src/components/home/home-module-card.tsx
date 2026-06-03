import Link from "next/link";
import type { AppModule } from "@/contracts/modules";
import { getModuleHref, MODULE_ICON_MAP } from "@/lib/module-registry";
import { ChevronRight } from "lucide-react";

const SHORT_TITLES: Partial<Record<string, string>> = {
  workbench: "科研工作台",
  projects: "项目管理",
  knowledge: "文献库",
  plagiarism: "查重降重",
  plot: "数据绘图",
  "xrd-lab": "XRD 实验室",
};

interface HomeModuleCardProps {
  module: AppModule;
  variant?: "featured" | "tool";
  projectId?: string | null;
}

export function HomeModuleCard({ module, variant = "tool", projectId }: HomeModuleCardProps) {
  const Icon = MODULE_ICON_MAP[module.iconKey];
  const href = getModuleHref(module, projectId);
  const title = SHORT_TITLES[module.id] ?? module.title;

  if (variant === "featured") {
    return (
      <Link
        href={href}
        className="group relative flex min-h-[7.5rem] flex-col justify-between overflow-hidden rounded-2xl border border-[#1a5632]/10 bg-white p-5 transition-all hover:border-[#1a5632]/25 hover:shadow-[0_8px_30px_-12px_rgba(26,86,50,0.2)]"
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#1a5632]/[0.05] transition-transform group-hover:scale-110" />
        <div className="relative flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a5632]/10 text-[#1a5632]">
            <Icon className="h-5 w-5" />
          </div>
          <ChevronRight className="h-5 w-5 text-[#1a5632]/25 transition-all group-hover:translate-x-0.5 group-hover:text-[#1a5632]" />
        </div>
        <div className="relative mt-4 space-y-1">
          <h3 className="text-base font-semibold text-[#122820]">{title}</h3>
          <p className="line-clamp-2 text-xs leading-relaxed text-[#6b7c72]">{module.description}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-[#1a5632]/8 bg-white/90 px-4 py-3.5 transition-all hover:border-[#1a5632]/20 hover:bg-white hover:shadow-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f4f1] text-[#1a5632] transition-colors group-hover:bg-[#1a5632]/10">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#122820]">{title}</p>
        <p className="truncate text-xs text-[#6b7c72]">{module.description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#1a5632]/30 group-hover:text-[#1a5632]" />
    </Link>
  );
}
