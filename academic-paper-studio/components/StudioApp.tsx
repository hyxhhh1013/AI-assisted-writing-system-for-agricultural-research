"use client";

import { useStudioSession } from "../hooks/use-studio-session";
import { WelcomeScreen } from "./WelcomeScreen";
import { ModePicker } from "./ModePicker";
import { IntakeWizard } from "./IntakeWizard";
import { ConfigConfirm } from "./ConfigConfirm";
import { PipelineBoard } from "./PipelineBoard";
import { PhaseWorkspace } from "./PhaseWorkspace";
import { ProjectBinder } from "./ProjectBinder";
import { Button, buttonVariants } from "@/components/ui/button";
import { siteShellClass, siteTheme } from "@/lib/site-theme";
import { LabBackground } from "@/components/layout/lab-background";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { GraduationCap, ExternalLink } from "lucide-react";

export function StudioApp() {
  const studio = useStudioSession();
  const { session, hydrated, reset, selectMode, goScreen } = studio;
  const projectId = session.linkedProject?.id;

  const hasProgress =
    hydrated
    && (session.mode !== null || Boolean(session.config.topic) || session.checkpoints.configConfirmed);

  // 欢迎页以外都显示项目条；流水线里 ProjectBinder 会再显示完整版
  const showTopBinder =
    hydrated
    && session.screen !== "welcome"
    && session.screen !== "pipeline";

  if (!hydrated) {
    return (
      <div className={siteShellClass}>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center text-sm text-[#6b7c72]">
          正在恢复你的进度…
        </div>
      </div>
    );
  }

  return (
    <div className={siteShellClass}>
      <LabBackground />
      <main className="relative mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <PageHeader
          title="学术论文工作坊"
          subtitle="按八阶段引导；真正的写作/文献/绘图在工作台完成"
          icon={GraduationCap}
          backHref="/"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {projectId ? (
                <a
                  href={`/workbench?id=${encodeURIComponent(projectId)}`}
                  className={cn(buttonVariants({ size: "sm" }), siteTheme.btnPrimary)}
                >
                  打开工作台
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              ) : (
                <a
                  href="/projects"
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                >
                  先去建项目
                </a>
              )}
              {session.screen !== "welcome" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#6b7c72]"
                  onClick={() => {
                    if (window.confirm("确定清空本地进度并重新开始？")) reset();
                  }}
                >
                  重新开始
                </Button>
              ) : null}
            </div>
          }
        />

        {showTopBinder ? (
          <div className="mb-6">
            <ProjectBinder studio={studio} compact={Boolean(session.linkedProject)} />
          </div>
        ) : null}

        {session.screen === "welcome" ? (
          <div className="space-y-6">
            <ProjectBinder studio={studio} />
            <WelcomeScreen
              onStart={() => goScreen("mode")}
              onResume={
                hasProgress && session.mode
                  ? () =>
                      goScreen(
                        session.checkpoints.configConfirmed
                          ? "pipeline"
                          : session.config.topic
                            ? "intake"
                            : "mode",
                      )
                  : null
              }
            />
          </div>
        ) : null}

        {session.screen === "mode" ? <ModePicker onSelect={selectMode} /> : null}

        {session.screen === "intake" ? <IntakeWizard studio={studio} /> : null}

        {session.screen === "config-confirm" ? <ConfigConfirm studio={studio} /> : null}

        {session.screen === "pipeline" ? <PipelineBoard studio={studio} /> : null}

        {session.screen === "phase" ? <PhaseWorkspace studio={studio} /> : null}
      </main>
    </div>
  );
}
