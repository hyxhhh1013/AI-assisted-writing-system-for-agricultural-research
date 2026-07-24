"use client";

import type { StudioController } from "../hooks/use-studio-session";
import { getPhase, canEnterPhase } from "../flow";
import { PhaseJumpActions } from "./PhaseJumpActions";
import { LiteratureBeginnerGuide } from "./LiteratureBeginnerGuide";
import { Button } from "@/components/ui/button";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, GitBranch } from "lucide-react";

interface PhaseWorkspaceProps {
  studio: StudioController;
}

export function PhaseWorkspace({ studio }: PhaseWorkspaceProps) {
  const {
    session,
    goScreen,
    completePhase,
    doApproveOutline,
    doSkipLiterature,
  } = studio;
  const phase = getPhase(session.currentPhase);
  const gate = canEnterPhase(session, session.currentPhase);
  const status = session.phaseStatus[session.currentPhase];
  const projectId = session.linkedProject?.id ?? null;

  if (!gate.ok && status === "locked") {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <p className="text-lg font-semibold text-[#122820]">这一步还不能开始</p>
        <p className="text-sm text-[#6b7c72]">{gate.reason}</p>
        <Button variant="outline" onClick={() => goScreen("pipeline")}>
          返回流水线
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" className="-ml-2 gap-2" onClick={() => goScreen("pipeline")}>
        <ArrowLeft className="h-4 w-4" />
        返回流水线
      </Button>

      <header>
        <p className="text-xs font-medium text-[#1a5632]">
          第 {phase.id} 步 · {phase.code}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-[#122820]">{phase.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#3d4f46]">{phase.blurb}</p>
      </header>

      {phase.id === 1 ? (
        <LiteratureBeginnerGuide
          projectId={projectId}
          onSkipAndContinue={doSkipLiterature}
        />
      ) : null}

      {/* 主操作：进真实工具 */}
      <div className={cn(siteTheme.card, "space-y-3 p-4")}>
        <h3 className="text-sm font-semibold text-[#122820]">
          {phase.id === 1 ? "更多入口" : "去做这一步（真实工具）"}
        </h3>
        <p className="text-xs text-[#6b7c72]">
          {phase.id === 1
            ? "上面三条路径任选其一即可；下面是同一批工具的快捷链接。"
            : "点下面按钮会打开禾书耕文已有页面。写完或改完后回到本页，再点「本步完成」。"}
        </p>
        {phase.parallelTracks ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {phase.parallelTracks.map((track) => (
              <div key={track.id} className="rounded-xl border border-[#1a5632]/12 p-3">
                <p className="mb-2 flex items-center gap-1 text-xs font-medium text-[#1a5632]">
                  <GitBranch className="h-3.5 w-3.5" />
                  {track.id.toUpperCase()} · {track.title}
                </p>
                <PhaseJumpActions phase={5} track={track.id} projectId={projectId} />
              </div>
            ))}
          </div>
        ) : (
          <PhaseJumpActions phase={phase.id} projectId={projectId} />
        )}
      </div>

      <details className="rounded-xl border border-[#1a5632]/10 bg-white/70 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[#122820]">
          查看本步说明与检查点
        </summary>
        <div className="mt-3 grid gap-3 text-sm text-[#3d4f46] sm:grid-cols-2">
          <div>
            <p className="font-medium text-[#122820]">你要做的事</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {phase.studentTasks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-[#122820]">产出</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {phase.outputs.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            {phase.checkpoint ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                检查点：{phase.checkpoint}
              </p>
            ) : null}
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-3 border-t border-[#1a5632]/10 pt-6">
        {phase.id === 1 ? (
          <Button variant="outline" onClick={doSkipLiterature}>
            先跳过，后面边写边补文献
          </Button>
        ) : null}
        {phase.id === 2 ? (
          <Button
            variant="outline"
            onClick={doApproveOutline}
            disabled={session.checkpoints.outlineApproved}
          >
            {session.checkpoints.outlineApproved ? "大纲已批准" : "批准大纲（解锁下一步）"}
          </Button>
        ) : null}
        <Button
          className={siteTheme.btnPrimary}
          disabled={phase.id === 2 && !session.checkpoints.outlineApproved}
          onClick={() => completePhase(phase.id)}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {status === "done" ? "已完成，返回流水线" : "本步完成，进入下一步"}
        </Button>
      </div>
    </div>
  );
}
