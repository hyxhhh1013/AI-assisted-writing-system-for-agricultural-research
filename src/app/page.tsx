"use client";

import { useEffect, useState } from "react";
import { HomeHero } from "@/components/home/home-hero";
import { HomeModuleSections } from "@/components/home/home-module-sections";
import { HomeTopBar } from "@/components/home/home-top-bar";
import { LabBackground } from "@/components/layout/lab-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { projectStore } from "@/lib/store";
import { siteShellClass } from "@/lib/site-theme";
import type { ProjectListItem } from "@/services/project";

export default function Home() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);

  useEffect(() => {
    void projectStore.list().then(setProjects);
  }, []);

  const recentProject = projects[0] ?? null;

  return (
    <div className={siteShellClass}>
      <LabBackground />

      <HomeTopBar />

      <main className="relative mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-10">
        <HomeHero projects={projects} />

        <div className="my-12 h-px bg-gradient-to-r from-transparent via-[#1a5632]/15 to-transparent" />

        <HomeModuleSections recentProjectId={recentProject?.id ?? null} />

        <SiteFooter className="mt-16 border-t pt-8" />
      </main>
    </div>
  );
}
