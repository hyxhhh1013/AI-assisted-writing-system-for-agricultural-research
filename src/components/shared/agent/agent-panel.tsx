"use client";

import { Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAgent } from "@/hooks/use-agent";
import { AgentActionCard } from "@/components/shared/agent/agent-thought";
import { AgentThought } from "@/components/shared/agent/agent-thought";
import { AgentInputBar } from "@/components/shared/agent/agent-input";

interface AgentPanelProps {
  projectId?: string;
  directionSlug?: string;
  className?: string;
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

export function AgentPanel({ projectId, directionSlug, className }: AgentPanelProps) {
  const agent = useAgent({ projectId, directionSlug });

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">AI Agent</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {STATUS_LABEL[agent.status] ?? agent.status}
        </span>
      </div>

      {agent.plan && agent.plan.subtasks.length > 0 && (
        <div className="border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground/80">计划</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            {agent.plan.subtasks.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ol>
        </div>
      )}

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-3">
          {agent.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Phase A 只读模式：可检索文献、分析方向、验证引用与审查内容。不会自动写入编辑器。
            </p>
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
                <div key={i} className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm whitespace-pre-wrap">
                  <p className="mb-1 font-medium text-primary">完成</p>
                  {msg.summary.text}
                </div>
              );
            }
            return null;
          })}
        </div>
      </ScrollArea>

      <AgentInputBar
        disabled={false}
        isRunning={agent.isRunning}
        onSend={(goal) => void agent.sendGoal(goal)}
        onCancel={agent.cancel}
      />
    </div>
  );
}
