import type { ReactNode } from "react";
import type { AppModule, HomeModuleCategory } from "@/contracts/modules";
import {
  HOME_CATEGORY_ORDER,
  HOME_SECTION_LABELS,
  groupHomeModules,
} from "@/lib/module-registry";
import { HomeModuleCard } from "@/components/home/home-module-card";
import Link from "next/link";

interface HomeModuleSectionsProps {
  recentProjectId?: string | null;
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-[#1a5632]" />
        <h2 className="text-sm font-semibold tracking-wide text-[#122820]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function HomeModuleSections({ recentProjectId }: HomeModuleSectionsProps) {
  const grouped = groupHomeModules();

  return (
    <div className="space-y-12">
      {HOME_CATEGORY_ORDER.map((category) => (
        <ModuleGroup
          key={category}
          category={category}
          modules={grouped[category]}
          recentProjectId={recentProjectId}
        />
      ))}
    </div>
  );
}

function ModuleGroup({
  category,
  modules,
  recentProjectId,
}: {
  category: HomeModuleCategory;
  modules: AppModule[];
  recentProjectId?: string | null;
}) {
  if (modules.length === 0) return null;

  if (category === "help") {
    return (
      <section className="rounded-2xl border border-dashed border-[#1a5632]/15 bg-[#1a5632]/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-xs font-medium text-[#6b7c72]">{HOME_SECTION_LABELS[category]}</span>
          <span className="text-[#1a5632]/30">|</span>
          {modules.map((module, i) => (
            <span key={module.id} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-[#1a5632]/20">·</span>}
              <Link
                href={module.href}
                className="text-sm text-[#1a5632] underline-offset-4 hover:underline"
              >
                {module.title}
              </Link>
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader title={HOME_SECTION_LABELS[category]} />
      <div
        className={
          category === "core"
            ? "grid gap-4 sm:grid-cols-2"
            : "grid gap-2 sm:grid-cols-2 lg:grid-cols-2"
        }
      >
        {modules.map((module) => (
          <HomeModuleCard
            key={module.id}
            module={module}
            variant={category === "core" ? "featured" : "tool"}
            projectId={module.requiresProjectId ? recentProjectId : null}
          />
        ))}
      </div>
    </section>
  );
}
