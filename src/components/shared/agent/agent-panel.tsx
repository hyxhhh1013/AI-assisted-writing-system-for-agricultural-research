"use client";

import { Bot, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAgent } from "@/hooks/use-agent";
import type { AgentChartPersistedInfo } from "@/lib/agent/chart-persisted";
import type { AgentProjectMutatedInfo } from "@/lib/agent/project-mutated";
import type { AgentSectionPersistedInfo } from "@/lib/agent/section-persisted";
import { isAgentWritePublicEnabled } from "@/lib/agent/core/safety";
import { suggestNextAgentActions } from "@/lib/agent/project-briefing";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  AgentActionCard,
  AgentThought,
  AgentSummaryContent,
} from "@/components/shared/agent/agent-thought";
import { AgentInputBar } from "@/components/shared/agent/agent-input";
import { AgentConfigQa } from "@/components/shared/agent/agent-config-qa";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getProject, patchPaperPassportConfig } from "@/services/project";
import type { ProjectData } from "@/contracts/project";
import { parsePaperPassport, type PaperConfigRecord } from "@/contracts/paper-passport";
import { formatConfigQaSummary, hasCompletePaperConfig } from "@/lib/agent/config-qa";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import type { PhaseTaskPack } from "@/contracts/phase-task-pack";
import { toast } from "sonner";

interface AgentPanelProps {
  projectId?: string;
  directionSlug?: string;
  className?: string;
  onSectionPersisted?: (info: AgentSectionPersistedInfo) => void;
  onChartPersisted?: (info: AgentChartPersistedInfo) => void;
  onProjectMutated?: (info: AgentProjectMutatedInfo) => void;
  /** 工作台侧栏收起 */
  onCollapse?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "就绪",
  planning: "规划中",
  thinking: "思考中",
  executing: "执行中",
  finalizing: "汇总中",
  awaiting_checkpoint: "等你确认",
  completed: "已完成",
  error: "出错",
  cancelled: "已取消",
};

const WRITE_PUBLIC = isAgentWritePublicEnabled();

/**
 * 聊天优先：对话区占满，状态/确认收成紧凑条，输入框始终可见。
 */
export function AgentPanel({
  projectId,
  directionSlug,
  className,
  onSectionPersisted,
  onChartPersisted,
  onProjectMutated,
  onCollapse,
}: AgentPanelProps) {
  const agent = useAgent({
    projectId,
    directionSlug,
    onSectionPersisted,
    onChartPersisted,
    onProjectMutated,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [phasePack, setPhasePack] = useState<PhaseTaskPack | null>(null);
  const [phaseGoal, setPhaseGoal] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [reviseNote, setReviseNote] = useState("");
  const [showRevise, setShowRevise] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  /** 手动打开问答（不依赖检查点也能填） */
  const [manualConfigQa, setManualConfigQa] = useState(false);
  /** 用户点了「稍后再说」后隐藏自动弹出，点「填写论文信息」可再开 */
  const [configQaDismissed, setConfigQaDismissed] = useState(false);

  const projectTitle = project?.title ?? null;
  const paperConfig = useMemo(
    () => parsePaperPassport(project?.paperPassport ?? null)?.config,
    [project?.paperPassport],
  );
  const configComplete = hasCompletePaperConfig(paperConfig);
  const isConfigCheckpoint =
    agent.pendingCheckpoint?.kind === "config_confirm";
  const showConfigQa =
    Boolean(projectId)
    && (
      isConfigCheckpoint
      || manualConfigQa
      || (!configComplete && !agent.isRunning && !configQaDismissed)
    );

  const applyProjectSnapshot = useCallback((p: ProjectData) => {
    setProject(p);
    const passport = parsePaperPassport(p.paperPassport);
    const mode = p.mode === "research" ? "research" : "review";
    const keys = getCoreSectionKeysForMode(mode);
    const emptySections = keys.filter((key) => {
      const content = key === "abstract" ? p.abstract : p.sections?.[key];
      return !(content?.trim().length);
    });
    const sectionFills = keys.map((key) => {
      const content = key === "abstract" ? p.abstract : p.sections?.[key];
      return {
        key,
        chars: content?.replace(/\s+/g, "").length ?? 0,
      };
    });
    const snapshot: AgentProjectSnapshot = {
      title: p.title,
      mode,
      language: p.language === "en" ? "en" : "zh",
      template: p.template || "sci",
      citationStyle:
        p.citationStyle === "vancouver"
        || p.citationStyle === "apa7"
        || p.citationStyle === "ieee"
          ? p.citationStyle
          : "gbt7714",
      researchDirection: p.researchDirection || "",
      outline: p.outline || "",
      references: p.references ?? [],
      dataClaims: [],
      currentPhase: passport?.currentPhase ?? null,
      hasWritingBlueprint: Boolean(p.writingBlueprint?.trim()),
      hasArgumentBlueprint: Boolean(p.argumentBlueprint?.trim()),
      sectionFills,
      hasPaperConfig: hasCompletePaperConfig(passport?.config),
    };
    const resolved = resolvePhaseTaskPack(snapshot);
    setPhasePack(resolved.pack);
    setPhaseGoal(resolved.goal);
    setQuickPrompts(
      [
        "看看项目卡在哪，建议下一步",
        ...suggestNextAgentActions({
          currentPhase: passport?.currentPhase ?? null,
          writeEnabled: WRITE_PUBLIC,
          hasOutline: Boolean(p.outline?.trim()),
          hasArgumentBlueprint: Boolean(p.argumentBlueprint?.trim()),
          emptySections,
        }),
      ]
        .filter((x, i, arr) => arr.indexOf(x) === i)
        .slice(0, 4),
    );
  }, []);

  const lastUserGoal = useMemo(() => {
    for (let i = agent.messages.length - 1; i >= 0; i--) {
      const m = agent.messages[i];
      if (m.kind === "user") return m.text;
    }
    return phaseGoal;
  }, [agent.messages, phaseGoal]);

  let lastFailure: string | null = null;
  if (agent.status === "error") {
    lastFailure = "执行失败，可再试一次。";
    for (let i = agent.messages.length - 1; i >= 0; i--) {
      const m = agent.messages[i];
      if (m.kind === "observation" && m.error) {
        lastFailure = m.error;
        break;
      }
      if (m.kind === "summary" && /失败|错误|无法/.test(m.summary.text)) {
        lastFailure = m.summary.text.slice(0, 160);
        break;
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setProject(null);
      setPhasePack(null);
      setPhaseGoal(null);
      setQuickPrompts(
        suggestNextAgentActions({
          writeEnabled: WRITE_PUBLIC,
          hasOutline: false,
          hasArgumentBlueprint: false,
          emptySections: [],
        }),
      );
      return;
    }
    // 运行中不反复拉项目，减少与 SSE 抢主线程/带宽
    if (agent.isRunning) return;
    void getProject(projectId).then((p) => {
      if (cancelled || !p) return;
      applyProjectSnapshot(p);
    });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    agent.isRunning,
    agent.lastPersisted,
    agent.lastProjectMutation?.at,
    applyProjectSnapshot,
  ]);

  const handleConfigSaveAndApprove = useCallback(
    async (cfg: PaperConfigRecord) => {
      if (!projectId) return;
      setConfigSaving(true);
      try {
        await patchPaperPassportConfig(projectId, cfg);
        const note = formatConfigQaSummary(cfg);
        const refreshed = await getProject(projectId);
        if (refreshed) applyProjectSnapshot(refreshed);
        onProjectMutated?.({
          tool: "update_paper_config",
          label: "论文配置",
          at: Date.now(),
        });
        setManualConfigQa(false);
        toast.success("论文信息已保存");
        if (isConfigCheckpoint && agent.pendingCheckpoint) {
          await agent.resolveCheckpoint("approve", note);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存配置失败");
      } finally {
        setConfigSaving(false);
      }
    },
    [
      projectId,
      agent,
      isConfigCheckpoint,
      applyProjectSnapshot,
      onProjectMutated,
    ],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.messages, agent.status, agent.pendingCheckpoint, agent.pendingConfirm]);

  const statusHint = useMemo(
    () => STATUS_LABEL[agent.status] ?? agent.status,
    [agent.status],
  );

  const planDone = agent.plan?.subtasks.filter((s) => s.status === "done").length ?? 0;
  const planTotal = agent.plan?.subtasks.length ?? 0;
  const interrupted = agent.interruptedSessions[0] ?? null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-[#fafaf8]", className)}>
      {/* 顶栏：标题 + 状态 + 操作 */}
      <header className="shrink-0 border-b border-border/50 bg-white/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-[15px] font-semibold tracking-tight text-[#122820]">写作助手</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px]",
              agent.isRunning
                ? "bg-primary/10 text-primary"
                : agent.status === "awaiting_checkpoint"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {statusHint}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            {interrupted && !agent.isRunning ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => void agent.resumeSession(interrupted.id)}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                继续上次
              </Button>
            ) : null}
            {!agent.isRunning && agent.messages.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={agent.startNewChat}
              >
                新对话
              </Button>
            ) : null}
            {agent.isRunning ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-destructive"
                onClick={agent.cancel}
              >
                停止
              </Button>
            ) : null}
            {onCollapse ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onCollapse}
                aria-label="收起侧栏"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {projectTitle ? (
            <span className="max-w-[50%] truncate text-foreground/75">{projectTitle}</span>
          ) : (
            <span>未绑定项目</span>
          )}
          {phasePack ? (
            <>
              <span className="text-border">·</span>
              <span>
                Phase {phasePack.phase} · {phasePack.title}
              </span>
            </>
          ) : null}
          {agent.lastPersisted ? (
            <>
              <span className="text-border">·</span>
              <span className="text-[#1a5632]">
                已写回 {agent.lastPersisted.sectionKey}
              </span>
            </>
          ) : null}
          {projectId && !agent.isRunning ? (
            <>
              <span className="text-border">·</span>
              <button
                type="button"
                className={cn(
                  "underline-offset-2 hover:underline",
                  configComplete ? "text-muted-foreground" : "font-medium text-amber-800",
                )}
                onClick={() => {
                  setConfigQaDismissed(false);
                  setManualConfigQa((v) => !v);
                }}
              >
                {configComplete ? "改论文信息" : "填写论文信息"}
              </button>
            </>
          ) : null}
        </div>

        {showConfigQa && !isConfigCheckpoint ? (
          <div className="mt-2 max-h-[min(52vh,28rem)] overflow-y-auto rounded-md border border-amber-200/70 bg-amber-50/50 p-1">
            <AgentConfigQa
              projectTitle={projectTitle ?? undefined}
              existing={paperConfig}
              saving={configSaving}
              onComplete={handleConfigSaveAndApprove}
              onSkip={() => {
                setManualConfigQa(false);
                setConfigQaDismissed(true);
              }}
            />
          </div>
        ) : null}

        {agent.plan && planTotal > 0 ? (
          <button
            type="button"
            className="mt-1.5 flex w-full items-center gap-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setPlanOpen((v) => !v)}
          >
            {planOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>
              本轮计划 {planDone}/{planTotal}
            </span>
          </button>
        ) : null}
        {planOpen && agent.plan ? (
          <ol className="mt-1 space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {agent.plan.subtasks.map((s) => (
              <li
                key={s.id}
                className={cn(
                  s.status === "done" && "line-through opacity-60",
                  s.status === "running" && "font-medium text-foreground",
                )}
              >
                {s.title}
              </li>
            ))}
          </ol>
        ) : null}
      </header>

      {/* 对话主区：加宽阅读列 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <div className="mx-auto flex w-full max-w-none flex-col gap-2.5">
          {agent.messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-white/70 px-5 py-8 text-sm text-muted-foreground">
              {!projectId ? (
                <p>请先打开一篇论文项目。</p>
              ) : (
                <>
                  <p className="text-[15px] font-medium text-foreground/90">直接说你想做什么</p>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
                    <li>看看项目卡在哪</li>
                    <li>帮我写引言</li>
                    <li>先生成大纲，我确认后再写</li>
                  </ul>
                  {phaseGoal ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-5 h-8 text-xs"
                      disabled={agent.isRunning}
                      onClick={() => void agent.sendGoal(phaseGoal)}
                    >
                      建议：{phasePack?.title}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          )}

          {agent.messages.map((msg, i) => {
            if (msg.kind === "divider") {
              return (
                <div key={i} className="flex items-center gap-2 py-1" role="separator">
                  <div className="h-px flex-1 bg-border/70" />
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {msg.label?.trim() || "新对话"}
                  </span>
                  <div className="h-px flex-1 bg-border/70" />
                </div>
              );
            }
            if (msg.kind === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] leading-relaxed text-primary-foreground">
                    {msg.text}
                  </div>
                </div>
              );
            }
            if (msg.kind === "thought") {
              const isLatestThought =
                agent.isRunning
                && agent.messages.findLastIndex((m) => m.kind === "thought") === i;
              return (
                <AgentThought key={i} text={msg.text} defaultOpen={isLatestThought} />
              );
            }
            if (msg.kind === "action") {
              const obs = agent.messages[i + 1];
              const observation =
                obs?.kind === "observation" && obs.tool === msg.tool ? obs : undefined;
              return (
                <AgentActionCard
                  key={i}
                  tool={msg.tool}
                  params={msg.params}
                  summary={observation?.summary}
                  error={observation?.error}
                  imageUrl={observation?.imageUrl}
                />
              );
            }
            if (msg.kind === "observation") {
              const prev = agent.messages[i - 1];
              if (prev?.kind === "action" && prev.tool === msg.tool) return null;
              return (
                <AgentActionCard
                  key={i}
                  tool={msg.tool}
                  params={{}}
                  summary={msg.summary}
                  error={msg.error}
                  imageUrl={msg.imageUrl}
                />
              );
            }
            if (msg.kind === "summary") {
              return (
                <div
                  key={i}
                  className="rounded-2xl rounded-bl-md border border-border/45 bg-white px-4 py-3 shadow-sm shadow-black/[0.02]"
                >
                  <AgentSummaryContent text={msg.summary?.text} />
                </div>
              );
            }
            return null;
          })}

          {lastFailure && !agent.isRunning ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <p className="line-clamp-3">{lastFailure}</p>
              {lastUserGoal ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs"
                  onClick={() => void agent.sendGoal(lastUserGoal)}
                >
                  再试一次
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* 人在环：贴在输入上方，不占整块顶栏 */}
      {agent.pendingCheckpoint && !agent.isRunning ? (
        <div className="shrink-0 border-t border-amber-200/80 bg-amber-50/90 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-950">{agent.pendingCheckpoint.title}</p>
          <p className="mt-0.5 text-[11px] text-amber-900/80">{agent.pendingCheckpoint.message}</p>
          {isConfigCheckpoint ? (
            <div className="mt-2 max-h-[min(52vh,28rem)] overflow-y-auto">
              <AgentConfigQa
                projectTitle={projectTitle ?? undefined}
                existing={paperConfig}
                saving={configSaving}
                onComplete={handleConfigSaveAndApprove}
                onSkip={() => void agent.resolveCheckpoint("approve")}
              />
            </div>
          ) : (
            <>
              {agent.pendingCheckpoint.preview ? (
                <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-amber-200/60 bg-white/80 p-2 text-[10px] text-[#3d4f46]">
                  {agent.pendingCheckpoint.preview}
                </pre>
              ) : null}
              {showRevise ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={reviseNote}
                    onChange={(e) => setReviseNote(e.target.value)}
                    placeholder="想怎么改？可留空"
                    className="min-h-[56px] resize-none text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => {
                        void agent.resolveCheckpoint("revise", reviseNote.trim() || undefined);
                        setShowRevise(false);
                        setReviseNote("");
                      }}
                    >
                      提交修改意见
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => setShowRevise(false)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={() => void agent.resolveCheckpoint("approve")}
                  >
                    批准
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    onClick={() => setShowRevise(true)}
                  >
                    需修改
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {agent.pendingConfirm && !agent.isRunning ? (
        <div className="shrink-0 border-t border-amber-200/80 bg-amber-50/90 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-950">
            {agent.pendingConfirm.tool === "import_reference" ? "确认导入文献" : "需要你确认"}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-900/80">{agent.pendingConfirm.message}</p>
          {agent.pendingConfirm.preview ? (
            <pre className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md border border-amber-200/60 bg-white/80 p-2 text-[10px] leading-relaxed text-[#3d4f46]">
              {agent.pendingConfirm.preview}
            </pre>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 text-xs"
              onClick={() => void agent.resolveConfirm(true)}
            >
              {agent.pendingConfirm.tool === "import_reference" ? "确认导入" : "确认"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => void agent.resolveConfirm(false)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {/* 输入始终可见 */}
      <AgentInputBar
        disabled={!projectId}
        isRunning={agent.isRunning}
        writeEnabled={WRITE_PUBLIC}
        prompts={quickPrompts}
        onSend={(goal) => void agent.sendGoal(goal)}
        onCancel={agent.cancel}
      />
    </div>
  );
}
