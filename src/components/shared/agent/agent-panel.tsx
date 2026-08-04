"use client";

import { Bot, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAgent } from "@/hooks/use-agent";
import type { AgentChartPersistedInfo } from "@/lib/agent/chart-persisted";
import type { AgentProjectMutatedInfo } from "@/lib/agent/project-mutated";
import type { AgentSectionPersistedInfo } from "@/lib/agent/section-persisted";
import { isAgentWritePublicEnabled } from "@/lib/agent/core/safety";
import { suggestNextAgentActions } from "@/lib/agent/project-briefing";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  AgentActionCard,
  AgentThought,
  AgentSummaryContent,
  AgentWorkingIndicator,
} from "@/components/shared/agent/agent-thought";
import { AgentInputBar } from "@/components/shared/agent/agent-input";
import { AgentConfigQa } from "@/components/shared/agent/agent-config-qa";
import { AgentCitationReportCard } from "@/components/shared/agent/agent-citation-report";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getProject, patchPaperPassportConfig } from "@/services/project";
import type { ProjectData } from "@/contracts/project";
import { parsePaperPassport, type PaperConfigRecord } from "@/contracts/paper-passport";
import { formatConfigQaSummary, hasCompletePaperConfig } from "@/lib/agent/config-qa";
import {
  applyEntryModeToGoal,
  getAgentEntryMode,
  type AgentEntryMode,
} from "@/lib/agent/entry-mode";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import type { PhaseTaskPack } from "@/contracts/phase-task-pack";
import { resolveLiveProgress } from "@/lib/agent/ui-progress";
import { toast } from "sonner";

const easeOut = [0.22, 1, 0.36, 1] as const;

function MessageEnter({
  children,
  animate,
  className,
}: {
  children: ReactNode;
  animate: boolean;
  className?: string;
}) {
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

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

/** 观察-only 卡片的稳定空 params，避免每次渲染新建对象破坏 memo */
const EMPTY_PARAMS: Record<string, unknown> = {};

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
  const [clarifyNote, setClarifyNote] = useState("");
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
  const entryMode: AgentEntryMode | null =
    getAgentEntryMode(paperConfig?.agentEntryMode)?.id ?? null;
  const entryModeLabel = getAgentEntryMode(entryMode)?.label ?? null;
  const isConfigCheckpoint =
    agent.pendingCheckpoint?.kind === "config_confirm";
  const isClarifyCheckpoint =
    agent.pendingCheckpoint?.kind === "clarify";
  /** 仅手动展开或检查点时出完整表单；缺配置时先给轻量邀请，避免一进 Tab 整块砸脸 */
  const showConfigQa =
    Boolean(projectId) && (isConfigCheckpoint || manualConfigQa);
  const showConfigInvite =
    Boolean(projectId)
    && !configComplete
    && !agent.isRunning
    && !configQaDismissed
    && !manualConfigQa
    && !isConfigCheckpoint;

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
    const coverage = evaluateDraftCoverage({
      mode,
      language: snapshot.language,
      sectionChars: sectionCharsFromFills(sectionFills),
    });
    setQuickPrompts(
      [
        "看看项目卡在哪，建议下一步",
        ...suggestNextAgentActions({
          currentPhase: passport?.currentPhase ?? null,
          writeEnabled: WRITE_PUBLIC,
          hasOutline: Boolean(p.outline?.trim()),
          hasArgumentBlueprint: Boolean(p.argumentBlueprint?.trim()),
          emptySections,
          nextSectionKey: coverage.nextSectionKey,
          thinOrGapSections: [
            ...coverage.requiredGaps,
            ...coverage.thinKeys,
          ],
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

  /** 是否贴近底部：贴近时新消息自动滚到底；往上翻历史时不再被拽下去 */
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [agent.messages, agent.status, agent.streamingText, agent.pendingCheckpoint, agent.pendingConfirm, atBottom]);

  const statusHint = useMemo(
    () => STATUS_LABEL[agent.status] ?? agent.status,
    [agent.status],
  );

  const planDone = agent.plan?.subtasks.filter((s) => s.status === "done").length ?? 0;
  const planTotal = agent.plan?.subtasks.length ?? 0;
  const interrupted = agent.interruptedSessions[0] ?? null;
  const liveProgress = useMemo(
    () =>
      resolveLiveProgress({
        status: agent.status,
        isRunning: agent.isRunning,
        messages: agent.messages,
      }),
    [agent.status, agent.isRunning, agent.messages],
  );

  /** 预计算每条消息的渲染标志，避免渲染循环内 O(n²) 扫描 */
  const msgFlags = useMemo(() => {
    const msgs = agent.messages;
    const n = msgs.length;
    const latestThoughtIdx = agent.isRunning
      ? msgs.findLastIndex((m) => m.kind === "thought")
      : -1;
    const latestActionIdx = agent.isRunning
      ? msgs.findLastIndex((m) => m.kind === "action")
      : -1;
    const obsForAction = new Map<number, number>();
    for (let i = 0; i < n - 1; i++) {
      const m = msgs[i];
      if (m.kind !== "action") continue;
      const next = msgs[i + 1];
      if (next?.kind === "observation" && next.tool === m.tool) {
        obsForAction.set(i, i + 1);
      }
    }
    return { latestThoughtIdx, latestActionIdx, obsForAction };
  }, [agent.messages, agent.isRunning]);

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
                  ? "bg-[#e8f0ea] text-[#1a5632]"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {agent.isRunning ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                {statusHint}
              </span>
            ) : (
              statusHint
            )}
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
                  configComplete ? "text-muted-foreground" : "font-medium text-[#1a5632]",
                )}
                onClick={() => {
                  setConfigQaDismissed(false);
                  setManualConfigQa((v) => !v);
                }}
              >
                {configComplete
                  ? entryModeLabel
                    ? `改配置（${entryModeLabel}）`
                    : "改论文信息"
                  : "填写论文信息"}
              </button>
            </>
          ) : null}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {showConfigInvite ? (
            <motion.div
              key="config-invite"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: easeOut }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#1a5632]/12 bg-[#f0f4f1]/70 px-2.5 py-2">
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#3d4f46]">
                  补全题目与类型后，写作建议会更准
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-[11px]"
                  onClick={() => {
                    setConfigQaDismissed(false);
                    setManualConfigQa(true);
                  }}
                >
                  去填写
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
                  onClick={() => setConfigQaDismissed(true)}
                >
                  稍后
                </Button>
              </div>
            </motion.div>
          ) : null}

          {showConfigQa && !isConfigCheckpoint ? (
            <motion.div
              key="config-qa"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.36, ease: easeOut }}
              className="overflow-hidden"
            >
              <div className="mt-2 max-h-[min(52vh,28rem)] overflow-y-auto">
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
            </motion.div>
          ) : null}
        </AnimatePresence>

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
                  "break-words",
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
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4"
      >
        <div className="mx-auto flex w-full min-w-0 max-w-none flex-col gap-2.5">
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
            const animateEnter = i >= agent.messages.length - 4;
            if (msg.kind === "divider") {
              return (
                <MessageEnter key={i} animate={animateEnter}>
                  <div className="flex items-center gap-2 py-1" role="separator">
                    <div className="h-px flex-1 bg-border/70" />
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {msg.label?.trim() || "新对话"}
                    </span>
                    <div className="h-px flex-1 bg-border/70" />
                  </div>
                </MessageEnter>
              );
            }
            if (msg.kind === "user") {
              return (
                <MessageEnter key={i} animate={animateEnter} className="flex justify-end">
                  <div className="max-w-[90%] break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] leading-relaxed text-primary-foreground">
                    {msg.text}
                  </div>
                </MessageEnter>
              );
            }
            if (msg.kind === "thought") {
              const isLatestThought = msgFlags.latestThoughtIdx === i;
              return (
                <MessageEnter key={i} animate={animateEnter}>
                  <AgentThought text={msg.text} defaultOpen={isLatestThought} />
                </MessageEnter>
              );
            }
            if (msg.kind === "action") {
              const obsIdx = msgFlags.obsForAction.get(i);
              const candidate = obsIdx != null ? agent.messages[obsIdx] : undefined;
              const observation =
                candidate?.kind === "observation" ? candidate : undefined;
              const pending =
                agent.isRunning
                && !observation
                && msgFlags.latestActionIdx === i;
              if (
                msg.tool === "validate_citations"
                && observation?.summary
                && !observation.error
              ) {
                return (
                  <MessageEnter key={i} animate={animateEnter}>
                    <AgentCitationReportCard
                      summary={observation.summary}
                      data={observation.data}
                    />
                  </MessageEnter>
                );
              }
              return (
                <MessageEnter key={i} animate={animateEnter}>
                  <AgentActionCard
                    tool={msg.tool}
                    params={msg.params}
                    summary={observation?.summary}
                    error={observation?.error}
                    imageUrl={observation?.imageUrl}
                    pending={pending}
                  />
                </MessageEnter>
              );
            }
            if (msg.kind === "observation") {
              if (msgFlags.obsForAction.has(i - 1)) return null;
              if (msg.tool === "validate_citations" && msg.summary && !msg.error) {
                return (
                  <MessageEnter key={i} animate={animateEnter}>
                    <AgentCitationReportCard summary={msg.summary} data={msg.data} />
                  </MessageEnter>
                );
              }
              return (
                <MessageEnter key={i} animate={animateEnter}>
                  <AgentActionCard
                    tool={msg.tool}
                    params={EMPTY_PARAMS}
                    summary={msg.summary}
                    error={msg.error}
                    imageUrl={msg.imageUrl}
                  />
                </MessageEnter>
              );
            }
            if (msg.kind === "summary") {
              return (
                <MessageEnter key={i} animate={animateEnter}>
                  <div className="rounded-2xl rounded-bl-md border border-border/45 bg-white px-4 py-3 shadow-sm shadow-black/[0.02]">
                    <AgentSummaryContent text={msg.summary?.text} />
                  </div>
                </MessageEnter>
              );
            }
            return null;
          })}

          {/* 真流式：agent 回复正在逐 token 到达 */}
          {agent.streamingText ? (
            <MessageEnter animate>
              <AgentThought text={agent.streamingText} defaultOpen streaming />
            </MessageEnter>
          ) : null}

          {lastFailure && !agent.isRunning ? (
            <MessageEnter animate>
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
            </MessageEnter>
          ) : null}

          {liveProgress ? (
            <MessageEnter animate>
              <AgentWorkingIndicator label={liveProgress} />
            </MessageEnter>
          ) : null}
        </div>

        {/* 用户往上翻历史时，新消息不再强制滚底；给一个悬浮回底按钮 */}
        {!atBottom ? (
          <div className="pointer-events-none sticky bottom-0 z-10 flex justify-end pb-2">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-white/95 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm shadow-black/[0.05] transition-colors hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
              回到底部
            </button>
          </div>
        ) : null}
      </div>

      {/* 人在环：贴在输入上方，滑入而非硬切 */}
      <AnimatePresence initial={false}>
        {agent.pendingCheckpoint && !agent.isRunning ? (
          <motion.div
            key="checkpoint"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.32, ease: easeOut }}
            className="shrink-0 border-t border-[#1a5632]/15 bg-[#f6f8f6] px-3 py-2.5"
          >
            <p className="text-xs font-medium text-[#122820]">{agent.pendingCheckpoint.title}</p>
            <p className="mt-0.5 text-[11px] text-[#3d4f46]/90">{agent.pendingCheckpoint.message}</p>
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
            ) : isClarifyCheckpoint ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={clarifyNote}
                  onChange={(e) => setClarifyNote(e.target.value)}
                  placeholder="输入你的回答…"
                  className="min-h-[56px] resize-none text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={() => {
                      void agent.resolveCheckpoint("approve", clarifyNote.trim() || undefined);
                      setClarifyNote("");
                    }}
                  >
                    提交回答
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setClarifyNote("");
                      void agent.resolveCheckpoint("approve", "请继续");
                    }}
                  >
                    跳过
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {agent.pendingCheckpoint.preview ? (
                  <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-white/90 p-2 text-[10px] text-[#3d4f46]">
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
          </motion.div>
        ) : null}

        {agent.pendingConfirm && !agent.isRunning ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.32, ease: easeOut }}
            className="shrink-0 border-t border-[#1a5632]/15 bg-[#f6f8f6] px-3 py-2.5"
          >
            <p className="text-xs font-medium text-[#122820]">
              {agent.pendingConfirm.tool === "import_reference" ? "确认导入文献" : "需要你确认"}
            </p>
            <p className="mt-0.5 text-[11px] text-[#3d4f46]/90">{agent.pendingConfirm.message}</p>
            {agent.pendingConfirm.preview ? (
              <pre className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-white/90 p-2 text-[10px] leading-relaxed text-[#3d4f46]">
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 输入始终可见 */}
      <AgentInputBar
        disabled={!projectId}
        isRunning={agent.isRunning}
        writeEnabled={WRITE_PUBLIC}
        prompts={quickPrompts}
        sessionId={agent.sessionId ?? undefined}
        projectId={projectId}
        onSend={(goal, opts) => {
          const firstUser = !agent.messages.some((m) => m.kind === "user");
          const payload = firstUser
            ? applyEntryModeToGoal(goal, entryMode)
            : goal;
          void agent.sendGoal(payload, opts);
        }}
        onCancel={agent.cancel}
      />
    </div>
  );
}
