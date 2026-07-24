"use client";

import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgent } from "@/hooks/use-agent";
import type { AgentSectionPersistedInfo } from "@/lib/agent/section-persisted";
import { isAgentWritePublicEnabled } from "@/lib/agent/core/safety";
import { suggestNextAgentActions } from "@/lib/agent/project-briefing";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { AgentActionCard } from "@/components/shared/agent/agent-thought";
import { AgentThought } from "@/components/shared/agent/agent-thought";
import { AgentInputBar } from "@/components/shared/agent/agent-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProject } from "@/services/project";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import type { PhaseTaskPack } from "@/contracts/phase-task-pack";
import { toast } from "sonner";

interface AgentPanelProps {
  projectId?: string;
  directionSlug?: string;
  className?: string;
  onSectionPersisted?: (info: AgentSectionPersistedInfo) => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "就绪",
  planning: "规划中…",
  thinking: "思考中…",
  executing: "执行工具…",
  finalizing: "汇总中…",
  completed: "已完成",
  error: "出错",
  cancelled: "已取消",
};

const WRITE_PUBLIC = isAgentWritePublicEnabled();

export function AgentPanel({
  projectId,
  directionSlug,
  className,
  onSectionPersisted,
}: AgentPanelProps) {
  const agent = useAgent({ projectId, directionSlug, onSectionPersisted });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [phasePack, setPhasePack] = useState<PhaseTaskPack | null>(null);
  const [phaseGoal, setPhaseGoal] = useState<string | null>(null);
  const [studentMode, setStudentMode] = useState(true);
  const [showAdvancedChat, setShowAdvancedChat] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("grainscript.agent.studentMode");
      if (raw === "0") setStudentMode(false);
      if (raw === "1") setStudentMode(true);
    } catch {
      /* ignore */
    }
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
    lastFailure = "本阶段执行失败，可再试一次或改用人控入口。";
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

  const toggleStudentMode = () => {
    setStudentMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("grainscript.agent.studentMode", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!next) setShowAdvancedChat(true);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setProjectTitle(null);
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
    void getProject(projectId).then((p) => {
      if (cancelled || !p) return;
      setProjectTitle(p.title);
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
      };
      const resolved = resolvePhaseTaskPack(snapshot);
      setPhasePack(resolved.pack);
      setPhaseGoal(resolved.goal);
      setQuickPrompts(
        [
          resolved.goal,
          ...suggestNextAgentActions({
            currentPhase: passport?.currentPhase ?? null,
            writeEnabled: WRITE_PUBLIC,
            hasOutline: Boolean(p.outline?.trim()),
            hasArgumentBlueprint: Boolean(p.argumentBlueprint?.trim()),
            emptySections,
          }),
        ].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, agent.lastPersisted]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.messages, agent.status]);

  const statusHint = useMemo(() => STATUS_LABEL[agent.status] ?? agent.status, [agent.status]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">写作 Agent</span>
        <span className="ml-auto text-xs text-muted-foreground">{statusHint}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px] text-muted-foreground"
          onClick={toggleStudentMode}
        >
          {studentMode ? "学生模式" : "自由模式"}
        </Button>
      </div>

      {projectTitle ? (
        <p className="shrink-0 truncate border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          绑定项目：<span className="text-foreground/80">{projectTitle}</span>
        </p>
      ) : null}

      {phasePack && phaseGoal && projectId ? (
        <div className="shrink-0 space-y-2 border-b border-[#1a5632]/15 bg-[#1a5632]/5 px-3 py-2">
          <p className="text-[11px] text-[#3d4f46]">
            当前阶段{" "}
            <span className="font-medium text-[#1a5632]">
              {phasePack.phase}. {phasePack.title}
            </span>
            <span className="mt-0.5 block text-[#6b7c72] line-clamp-2">{phaseGoal}</span>
          </p>
          <Button
            type="button"
            size={studentMode ? "default" : "sm"}
            className={cn("w-full text-xs", studentMode ? "h-10 font-medium" : "h-8")}
            disabled={agent.isRunning}
            onClick={() => void agent.sendGoal(phaseGoal)}
          >
            {studentMode ? `下一步：完成「${phasePack.title}」` : "完成当前阶段"}
          </Button>
          <p className="text-[10px] text-[#9aa8a0]">人控兜底：{phasePack.humanFallback}</p>
        </div>
      ) : null}

      {lastFailure && !agent.isRunning ? (
        <div className="shrink-0 space-y-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive line-clamp-2">{lastFailure}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 text-xs"
              disabled={!lastUserGoal}
              onClick={() => lastUserGoal && void agent.sendGoal(lastUserGoal)}
            >
              再试一次
            </Button>
            {phasePack ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  toast.message(phasePack.humanFallback);
                }}
              >
                去人控
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {agent.interruptedSessions.length > 0 && !agent.isRunning ? (
        <div className="shrink-0 space-y-2 border-b border-amber-200/80 bg-amber-50/80 px-3 py-2">
          <p className="text-xs font-medium text-amber-950">可继续的中断任务</p>
          {agent.interruptedSessions.slice(0, 3).map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-2 rounded-md border border-amber-200/60 bg-white/80 px-2 py-1.5"
            >
              <p className="min-w-0 flex-1 text-xs text-[#3d4f46] line-clamp-2">{s.goal}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                onClick={() => void agent.resumeSession(s.id)}
              >
                继续
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {agent.plan && agent.plan.subtasks.length > 0 && (
        <div className="shrink-0 border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground/80">计划</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            {agent.plan.subtasks.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ol>
        </div>
      )}

      {agent.lastPersisted ? (
        <div className="shrink-0 border-b border-[#1a5632]/20 bg-[#1a5632]/5 px-3 py-2 text-xs text-[#1a5632]">
          已写回章节 <strong>{agent.lastPersisted.sectionKey}</strong>
          {agent.lastPersisted.charCount != null
            ? `（约 ${agent.lastPersisted.charCount} 字）`
            : ""}
          ，可在「章节结构」查看。
        </div>
      ) : null}

      {/* 原生滚动：ScrollArea 在 flex 侧栏里经常无法滚轮翻页 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        <div className="space-y-3">
          {agent.messages.length === 0 && (
            <div className="space-y-2 text-sm text-muted-foreground">
              {!projectId ? (
                <p>请先打开一篇论文项目，再使用 Agent。</p>
              ) : studentMode ? (
                <p>
                  学生模式：优先点上方「下一步」按钮推进当前阶段；自由聊天可点下方「高级提问」展开。
                </p>
              ) : WRITE_PUBLIC ? (
                <>
                  <p>
                    已绑定当前项目。可说「写引言并保存」；Agent 会按项目大纲与空白章节行动。
                  </p>
                  <p className="text-xs">
                    中途停止后可在上方「继续」恢复。人控扩写仍在「章节协作」。
                  </p>
                </>
              ) : (
                <>
                  <p>当前为只读 Agent。可检索文献、分析方向、核对引用。</p>
                  <p className="text-xs">
                    写回章节需 <code className="text-[10px]">AGENT_WRITE_ENABLED=1</code> 与{" "}
                    <code className="text-[10px]">NEXT_PUBLIC_AGENT_WRITE_ENABLED=1</code>。
                  </p>
                </>
              )}
            </div>
          )}
          {agent.messages.map((msg, i) => {
            if (msg.kind === "user") {
              return (
                <div key={i} className="rounded-md bg-primary/10 px-3 py-2 text-sm">
                  {msg.text}
                </div>
              );
            }
            if (msg.kind === "thought") {
              return <AgentThought key={i} text={msg.text} />;
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
                />
              );
            }
            if (msg.kind === "summary") {
              return (
                <div key={i} className="whitespace-pre-wrap rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <p className="mb-1 font-medium text-primary">完成</p>
                  {msg.summary.text}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      <div className="shrink-0">
        {studentMode && !showAdvancedChat ? (
          <div className="border-t border-border/60 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs text-muted-foreground"
              onClick={() => setShowAdvancedChat(true)}
            >
              高级：自由提问（可选）
            </Button>
          </div>
        ) : (
          <AgentInputBar
            disabled={!projectId}
            isRunning={agent.isRunning}
            writeEnabled={WRITE_PUBLIC}
            prompts={studentMode ? [] : quickPrompts}
            onSend={(goal) => void agent.sendGoal(goal)}
            onCancel={agent.cancel}
          />
        )}
      </div>
    </div>
  );
}
