"use client";

import { Bot, CheckCircle2, ChevronDown, ChevronLeft, Circle, FileText, Loader2, Map as MapIcon, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AgentPlanCard } from "@/components/shared/agent/agent-plan";
import { WritingStatusCard } from "@/components/shared/agent/writing-status-card";
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
import { findNewBlueprintOpenIndex } from "@/lib/agent/blueprint-open-guard";
import { buildFigureReviseGoal } from "@/lib/agent/figure-revise";
import {
  collectSessionFigureDockItems,
  mergeProjectChartsIntoDock,
} from "@/lib/agent/figure-dock";
import type { FigureReviseFormValue, FigureReviseTarget } from "@/contracts/figure-revise";
import { parseProjectCharts } from "@/contracts/figure";
import { getProjectWritingMode, getSectionLabelForMode } from "@/lib/section-registry";
import { AgentFigureDock } from "@/components/shared/agent/agent-figure-dock";

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
  /** 打开蓝图工作台（blueprint_approve 检查点时查看/编辑完整蓝图） */
  onOpenBlueprint?: () => void;
  /** 跳到正文章节（配图结果卡「查看正文位置」） */
  onJumpToSection?: (sectionKey: string) => void;
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

/** 外部文献来源徽标 */
const IMPORT_SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  "semantic-scholar": "S2",
  crossref: "CrossRef",
  pubmed: "PubMed",
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
  onOpenBlueprint,
  onJumpToSection,
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
  const [reviseNote, setReviseNote] = useState("");
  const [showRevise, setShowRevise] = useState(false);
  const [clarifyNote, setClarifyNote] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  /** 手动打开问答（不依赖检查点也能填） */
  const [manualConfigQa, setManualConfigQa] = useState(false);
  /** 用户点了「稍后再说」后隐藏自动弹出，点「填写论文信息」可再开 */
  const [configQaDismissed, setConfigQaDismissed] = useState(false);
  /** import_reference 确认卡：勾选的候选项索引（null=无候选列表） */
  const [importSelection, setImportSelection] = useState<Set<number> | null>(null);
  /** 确认导入时的候选标题快照（进度卡渲染逐篇状态用；渲染受 importProgress 门控） */
  const [importItemsSnapshot, setImportItemsSnapshot] = useState<string[]>([]);

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
  const isBlueprintCheckpoint =
    agent.pendingCheckpoint?.kind === "blueprint_approve";
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
          hasWritingBlueprint: Boolean(p.writingBlueprint?.trim()),
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
          hasWritingBlueprint: false,
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
  }, [agent.messages, agent.status, agent.streamingText, agent.pendingCheckpoint, agent.pendingConfirm, agent.writeStatus, atBottom]);

  /** import_reference 确认卡候选变化时重置勾选：默认全选 */
  useEffect(() => {
    const items = agent.pendingConfirm?.params?.importItems;
    if (Array.isArray(items)) {
      setImportSelection(new Set(items.map((_, i) => i)));
    } else {
      setImportSelection(null);
    }
  }, [agent.pendingConfirm]);

  /**
   * 「看看蓝图」→ 仅对本轮新追加的 open_blueprint_workspace 成功结果自动打开。
   * 会话恢复 / 面板重挂载时只推进水位，绝不因历史 observation 误弹。
   */
  const blueprintScanSessionRef = useRef<string | null>(null);
  const blueprintScannedUntilRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onOpenBlueprint) return;
    const sessionKey = agent.sessionId ?? "__none__";
    if (blueprintScanSessionRef.current !== sessionKey) {
      blueprintScanSessionRef.current = sessionKey;
      blueprintScannedUntilRef.current = null;
    }
    // 首次同步（含恢复历史）：只记水位
    if (blueprintScannedUntilRef.current === null) {
      blueprintScannedUntilRef.current = agent.messages.length - 1;
      return;
    }
    // 换会话或清空后变短：重置水位，仍不打开
    if (agent.messages.length - 1 < blueprintScannedUntilRef.current) {
      blueprintScannedUntilRef.current = agent.messages.length - 1;
      return;
    }
    const idx = findNewBlueprintOpenIndex(
      agent.messages,
      blueprintScannedUntilRef.current,
    );
    if (idx < 0) return;
    blueprintScannedUntilRef.current = idx;
    onOpenBlueprint();
  }, [agent.messages, agent.sessionId, onOpenBlueprint]);

  const statusHint = useMemo(
    () => STATUS_LABEL[agent.status] ?? agent.status,
    [agent.status],
  );

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
  /** 写状态卡激活时用常驻卡，否则回退通用工作指示器（写进度职责已移交） */
  const displayProgress = useMemo(() => {
    if (agent.writeStatus) return null;
    if (!liveProgress) return null;
    // 思考/规划期间没有流式内容时，附上 plan 的下一步子任务，让「正在做什么」具体可读
    if (
      (agent.status === "thinking"
        || agent.status === "planning"
        || agent.status === "executing")
      && agent.plan?.subtasks?.length
    ) {
      const focus =
        agent.plan.subtasks.find((s) => s.id === agent.plan?.focusSubtaskId)
        ?? agent.plan.subtasks.find((s) => s.status === "running")
        ?? agent.plan.subtasks.find((s) => s.status === "pending");
      if (focus?.title) return `${liveProgress} · ${focus.title}`;
    }
    return liveProgress;
  }, [liveProgress, agent.writeStatus, agent.status, agent.plan]);

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

  /** import_reference 确认卡批量选择 */
  const confirmImportItems = useMemo(
    () =>
      Array.isArray(agent.pendingConfirm?.params?.importItems)
        ? (agent.pendingConfirm.params.importItems as Array<{
            title?: string;
            year?: number;
            journal?: string;
            doi?: string;
            citedByCount?: number;
            source?: string;
            isOpenAccess?: boolean;
          }>)
        : [],
    [agent.pendingConfirm],
  );
  const isImportBatchConfirm =
    agent.pendingConfirm?.tool === "import_reference" && confirmImportItems.length > 0;
  const importSelectedCount = isImportBatchConfirm ? (importSelection?.size ?? 0) : 0;
  const importProgressPct =
    agent.importProgress && agent.importProgress.total > 0
      ? Math.min(100, Math.round((agent.importProgress.done / agent.importProgress.total) * 100))
      : null;

  const toggleImportItem = useCallback((idx: number, checked: boolean) => {
    setImportSelection((prev) => {
      const next = new Set(prev ?? []);
      if (checked) next.add(idx);
      else next.delete(idx);
      return next;
    });
  }, []);

  const setAllImport = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setImportSelection(new Set());
        return;
      }
      const items = agent.pendingConfirm?.params?.importItems;
      if (Array.isArray(items)) {
        setImportSelection(new Set(items.map((_, i) => i)));
      }
    },
    [agent.pendingConfirm],
  );

  /** 确认导入：记住候选标题列表（进度卡渲染逐篇状态），再触发批量导入 */
  const handleConfirmImport = useCallback(() => {
    if (isImportBatchConfirm) {
      setImportItemsSnapshot(
        confirmImportItems.map((x) => x.title || "(无标题)"),
      );
    }
    void agent.resolveConfirm(
      true,
      isImportBatchConfirm ? [...(importSelection ?? [])] : undefined,
    );
  }, [isImportBatchConfirm, confirmImportItems, importSelection, agent]);

  /** 配图结果卡「按意见改」：结构化表单 → 强制 replace */
  const handleReviseFigure = useCallback(
    (target: FigureReviseTarget, form: FigureReviseFormValue) => {
      if (agent.isRunning) {
        toast.message("请等当前任务结束后再改图");
        return;
      }
      void agent.sendGoal(buildFigureReviseGoal(target, form));
    },
    [agent],
  );

  const figureSectionLabel = useCallback(
    (sectionKey?: string) => {
      if (!sectionKey || !project) return undefined;
      return getSectionLabelForMode(
        sectionKey,
        getProjectWritingMode(project.mode),
        project.language === "en" ? "en" : "zh",
      );
    },
    [project],
  );

  const figureDockItems = useMemo(() => {
    const fromSession = collectSessionFigureDockItems(agent.messages, 6, projectId);
    const charts = project ? parseProjectCharts(project.charts) : [];
    return mergeProjectChartsIntoDock(fromSession, charts, 6, projectId);
  }, [agent.messages, project, projectId]);

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
            {onOpenBlueprint ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                title="写作蓝图（查看 / 编辑）"
                onClick={onOpenBlueprint}
              >
                <MapIcon className="mr-1 h-3.5 w-3.5" />
                蓝图
              </Button>
            ) : null}
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

        {agent.plan && agent.plan.subtasks.length > 0 ? (
          <AgentPlanCard plan={agent.plan} />
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
              if (
                msg.tool === "open_blueprint_workspace"
                && observation
                && !observation.error
                && onOpenBlueprint
              ) {
                return (
                  <MessageEnter key={i} animate={animateEnter}>
                    <div className="space-y-1.5">
                      <AgentActionCard
                        tool={msg.tool}
                        params={msg.params}
                        summary={observation.summary}
                        error={observation.error}
                        pending={pending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full text-xs"
                        onClick={onOpenBlueprint}
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        打开蓝图工作台
                      </Button>
                    </div>
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
                    plotHref={observation?.plotHref}
                    replaceImageUrl={observation?.replaceImageUrl}
                    sectionKey={observation?.sectionKey}
                    insertMode={observation?.insertMode}
                    sectionLabel={figureSectionLabel(observation?.sectionKey)}
                    figureSpecEnc={
                      observation?.data
                      && typeof observation.data === "object"
                      && typeof (observation.data as { figureSpecEnc?: unknown }).figureSpecEnc === "string"
                        ? String((observation.data as { figureSpecEnc: string }).figureSpecEnc)
                        : undefined
                    }
                    chartAssetId={
                      observation?.data
                      && typeof observation.data === "object"
                      && typeof (observation.data as { persisted?: { id?: unknown } }).persisted?.id === "string"
                        ? String((observation.data as { persisted: { id: string } }).persisted.id)
                        : undefined
                    }
                    projectId={projectId}
                    onReviseFigure={handleReviseFigure}
                    onJumpToSection={onJumpToSection}
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
              if (
                msg.tool === "open_blueprint_workspace"
                && !msg.error
                && onOpenBlueprint
              ) {
                return (
                  <MessageEnter key={i} animate={animateEnter}>
                    <div className="space-y-1.5">
                      <AgentActionCard
                        tool={msg.tool}
                        params={EMPTY_PARAMS}
                        summary={msg.summary}
                        error={msg.error}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full text-xs"
                        onClick={onOpenBlueprint}
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        打开蓝图工作台
                      </Button>
                    </div>
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
                    plotHref={msg.plotHref}
                    replaceImageUrl={msg.replaceImageUrl}
                    sectionKey={msg.sectionKey}
                    insertMode={msg.insertMode}
                    sectionLabel={figureSectionLabel(msg.sectionKey)}
                    figureSpecEnc={
                      msg.data
                      && typeof msg.data === "object"
                      && typeof (msg.data as { figureSpecEnc?: unknown }).figureSpecEnc === "string"
                        ? String((msg.data as { figureSpecEnc: string }).figureSpecEnc)
                        : undefined
                    }
                    chartAssetId={
                      msg.data
                      && typeof msg.data === "object"
                      && typeof (msg.data as { persisted?: { id?: unknown } }).persisted?.id === "string"
                        ? String((msg.data as { persisted: { id: string } }).persisted.id)
                        : undefined
                    }
                    projectId={projectId}
                    onReviseFigure={handleReviseFigure}
                    onJumpToSection={onJumpToSection}
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

          {agent.writeStatus ? (
            <MessageEnter animate>
              <WritingStatusCard
                status={agent.writeStatus}
                onRetry={
                  agent.writeStatus.stage === "error" && lastUserGoal
                    ? () => void agent.sendGoal(lastUserGoal)
                    : undefined
                }
              />
            </MessageEnter>
          ) : displayProgress ? (
            <MessageEnter animate>
              <AgentWorkingIndicator label={displayProgress} />
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
        {/* 批量导入进度（确认后不再干等，实时动画反馈） */}
        {agent.importProgress && !agent.writeStatus ? (
          <motion.div
            key="import-progress"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.32, ease: easeOut }}
            className="shrink-0 border-t border-[#1a5632]/15 bg-[#f0f4f1] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#1a5632]" />
              <span className="min-w-0 truncate text-xs font-medium text-[#122820]">
                {agent.importProgress.label}
              </span>
              {importProgressPct != null ? (
                <span className="shrink-0 text-[10px] tabular-nums text-[#3d4f46]/70">
                  {importProgressPct}%
                </span>
              ) : null}
            </div>
            {importProgressPct != null ? (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1a5632]/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#1a5632] to-[#3d9a5f]"
                  animate={{ width: `${importProgressPct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            ) : (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1a5632]/10">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#1a5632]/40 to-transparent"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                />
              </div>
            )}
            {importItemsSnapshot.length > 0 ? (
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                {importItemsSnapshot.map((title, i) => {
                  const done = agent.importProgress?.done ?? 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[10px]"
                    >
                      {i < done ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />
                      ) : i === done ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#1a5632]" />
                      ) : (
                        <Circle className="h-3 w-3 shrink-0 text-[#3d4f46]/25" />
                      )}
                      <span
                        className={
                          "min-w-0 truncate " +
                          (i < done
                            ? "text-muted-foreground/60 line-through"
                            : i === done
                              ? "font-medium text-[#1a5632]"
                              : "text-[#3d4f46]/60")
                        }
                      >
                        {title}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : agent.importProgress.title ? (
              <p className="mt-1 animate-pulse truncate text-[10px] text-[#3d4f46]/80">
                {agent.importProgress.title}
              </p>
            ) : null}
          </motion.div>
        ) : null}

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
                {isBlueprintCheckpoint && onOpenBlueprint ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full text-xs"
                      onClick={onOpenBlueprint}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      打开蓝图工作台（查看 / 编辑）
                    </Button>
                  </div>
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
            {isImportBatchConfirm ? (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#3d4f46]/80">
                    已收集 {confirmImportItems.length} 篇，已选 {importSelectedCount} 篇
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[10px] text-[#1a5632] hover:underline"
                      onClick={() => setAllImport(true)}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-[#3d4f46]/70 hover:underline"
                      onClick={() => setAllImport(false)}
                    >
                      全不选
                    </button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 bg-white/90">
                  {confirmImportItems.map((item, i) => {
                    const checked = importSelection?.has(i) ?? false;
                    return (
                      <label
                        key={i}
                        className="flex items-start gap-2 border-b border-border/40 px-2 py-1.5 last:border-0 cursor-pointer hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleImportItem(i, v === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] leading-snug break-words text-[#122820]">
                            {item.title || "(无标题)"}
                          </p>
                          <p className="text-[9px] text-[#6b7c72] truncate">
                            {[item.year, item.journal, item.doi].filter(Boolean).join(" · ")}
                          </p>
                          {(item.citedByCount != null || item.source || item.isOpenAccess) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {item.citedByCount != null && (
                                <span className="rounded bg-muted px-1 py-px text-[8px] leading-none text-muted-foreground">
                                  被引 {item.citedByCount}
                                </span>
                              )}
                              {item.source && IMPORT_SOURCE_LABELS[item.source] && (
                                <span className="rounded bg-[#6366f1]/10 px-1 py-px text-[8px] leading-none text-[#6366f1]">
                                  {IMPORT_SOURCE_LABELS[item.source]}
                                </span>
                              )}
                              {item.isOpenAccess && (
                                <span className="rounded bg-emerald-600/10 px-1 py-px text-[8px] leading-none text-emerald-700">
                                  OA
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 text-xs"
                disabled={isImportBatchConfirm && importSelectedCount === 0}
                onClick={() => void handleConfirmImport()}
              >
                {isImportBatchConfirm
                  ? `确认导入 ${importSelectedCount} 篇`
                  : agent.pendingConfirm.tool === "import_reference"
                    ? "确认导入"
                    : "确认"}
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

      {/* 配图坞：贴输入框上方，免翻聊天找「按意见改」 */}
      <AgentFigureDock
        items={figureDockItems}
        sectionLabelOf={figureSectionLabel}
        disabled={agent.isRunning}
        onRevise={handleReviseFigure}
        onJumpToSection={onJumpToSection}
        projectId={projectId}
      />

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
