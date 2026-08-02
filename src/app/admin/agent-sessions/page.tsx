"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Ban, Bot, AlertTriangle, Activity, Wrench } from "lucide-react";
import {
  getAdminAgentSessionDetail,
  getAdminAgentSessionStats,
  interruptAdminAgentSession,
  listAdminAgentSessions,
  type AdminAgentSessionDetail,
  type AdminAgentSessionStats,
} from "@/services/admin";
import type { AgentUiMessage } from "@/contracts/agent-session";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminExpandableList } from "@/components/admin/admin-expandable-list";
import { AdminMetricStrip } from "@/components/admin/admin-stat-card";
import { AdminPanel } from "@/components/admin/admin-panel";

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "interrupted", label: "已中断" },
  { value: "completed", label: "已完成" },
  { value: "error", label: "出错" },
];

const STATUS_COLOR: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  interrupted: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

/** 对话回放：把 uiTranscript 时间线渲染成可读的 Agent 执行记录 */
function TranscriptTimeline({ transcript }: { transcript: AgentUiMessage[] }) {
  return (
    <div className="space-y-2">
      {transcript.map((m, i) => {
        switch (m.kind) {
          case "user":
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-[#1a5632] px-3 py-2 text-xs text-white">{m.text}</div>
              </div>
            );
          case "thought":
            return (
              <div key={i} className="flex gap-2">
                <span className="shrink-0 text-xs">🧠</span>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs italic text-amber-800">{m.text}</div>
              </div>
            );
          case "action":
            return (
              <div key={i} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-blue-800">
                  <span>🔧</span>
                  <code className="font-mono font-medium">{m.tool}</code>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-blue-500">查看参数</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-[10px] text-[#3d4f46]">
                    {JSON.stringify(m.params, null, 2)}
                  </pre>
                </details>
              </div>
            );
          case "observation":
            return (
              <div key={i} className="rounded-lg border border-[#1a5632]/10 bg-white px-3 py-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="shrink-0">📥</span>
                  <div className="min-w-0 flex-1">
                    <code className="font-mono font-medium text-[#1a5632]">{m.tool}</code>
                    {m.error ? (
                      <p className="mt-0.5 text-red-600">{m.error}</p>
                    ) : m.summary ? (
                      <p className="mt-0.5 text-[#3d4f46]">{m.summary}</p>
                    ) : null}
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="工具结果" className="mt-1 max-h-40 rounded border" />
                    )}
                  </div>
                </div>
              </div>
            );
          case "summary":
            return (
              <div key={i} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
                <p className="mb-1 font-medium">✅ 完成摘要</p>
                <p>{m.summary.text}</p>
                {m.summary.keyFindings.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {m.summary.keyFindings.map((k, j) => (
                      <p key={j} className="text-[10px]">
                        • {k.fact} <span className="text-green-600">[{k.source}]</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          case "divider":
            return (
              <div key={i} className="flex items-center gap-2 text-[10px] text-[#9aa8a0]">
                <div className="h-px flex-1 bg-[#1a5632]/10" />
                {m.label ?? "会话分界"}
                <div className="h-px flex-1 bg-[#1a5632]/10" />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default function AdminAgentSessionsPage() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [detail, setDetail] = useState<AdminAgentSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interrupting, setInterrupting] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminAgentSessionStats | null>(null);

  useEffect(() => {
    getAdminAgentSessionStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const { setPage, data: sessions, meta, loading, reload } = useAdminList({
    fetcher: listAdminAgentSessions,
    filters: { status: statusFilter || undefined },
    urlSync: true,
  });

  const loadDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getAdminAgentSessionDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const doInterrupt = async (id: string) => {
    setInterrupting(id);
    try {
      const r = await interruptAdminAgentSession(id);
      if (r.ok) {
        toast.success("已强制中断");
        setDetail(null);
        await reload();
      } else {
        toast.error(r.error || "中断失败");
      }
    } catch {
      toast.error("中断失败");
    } finally {
      setInterrupting(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Agent 会话监控"
        actions={
          <AdminFilterPills value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        }
      />

      {stats && (
        <div className="space-y-4">
          <AdminMetricStrip
            items={[
              { label: "总会话", value: stats.total, icon: Bot },
              { label: "错误会话", value: stats.errorCount, icon: AlertTriangle, href: "/admin/agent-sessions?status=error" },
              { label: "错误率", value: stats.errorRate, icon: Activity, suffix: "%" },
              { label: "平均工具调用", value: stats.avgToolCalls, icon: Wrench },
            ]}
          />
          {stats.byUser.length > 0 && (
            <AdminPanel title="按用户分析" subtitle="会话量 Top 10">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a5632]/10 text-left text-[10px] text-[#6b7c72]">
                      <th className="px-2 py-2 font-medium">用户</th>
                      <th className="px-2 py-2 font-medium">会话</th>
                      <th className="px-2 py-2 font-medium">错误</th>
                      <th className="px-2 py-2 font-medium">错误率</th>
                      <th className="px-2 py-2 font-medium">平均工具</th>
                      <th className="px-2 py-2 font-medium">平均迭代</th>
                      <th className="px-2 py-2 font-medium">最近活跃</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byUser.map((u) => (
                      <tr key={u.userId} className="border-b border-[#1a5632]/5 text-xs">
                        <td className="px-2 py-2 font-medium text-[#122820]">{u.userName ?? u.userId.slice(0, 8)}</td>
                        <td className="px-2 py-2 tabular-nums">{u.sessionCount}</td>
                        <td className="px-2 py-2 tabular-nums">{u.errorCount}</td>
                        <td className={`px-2 py-2 tabular-nums ${u.errorRate > 30 ? "text-red-600" : u.errorRate > 10 ? "text-amber-600" : "text-green-600"}`}>
                          {u.errorRate}%
                        </td>
                        <td className="px-2 py-2 tabular-nums">{u.avgToolCalls}</td>
                        <td className="px-2 py-2 tabular-nums">{u.avgIterations}</td>
                        <td className="px-2 py-2 text-[#9aa8a0]">{new Date(u.lastActive).toLocaleString("zh-CN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminPanel>
          )}
        </div>
      )}

      <AdminExpandableList
        items={sessions}
        loading={loading}
        emptyText="暂无 Agent 会话"
        detailLoading={detailLoading}
        loadDetail={loadDetail}
        renderSummary={(s) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#122820]">{s.goal}</p>
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">
                {s.userName ?? s.userId.slice(0, 8)}
                {s.projectTitle ? ` · ${s.projectTitle}` : ""}
                {s.directionSlug ? ` · 方向 ${s.directionSlug}` : ""}
                {" · "}
                {new Date(s.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <Badge className={`shrink-0 ${STATUS_COLOR[s.status] || ""}`}>{s.status}</Badge>
          </div>
        )}
        renderDetail={() =>
          detail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">迭代 <b>{detail.iteration}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">工具调用 <b>{detail.toolCallCount}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">状态 <b>{detail.status}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">用户 <b>{detail.userName ?? detail.userId.slice(0, 8)}</b></div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#1a5632]/60">目标</p>
                <p className="rounded border border-[#1a5632]/10 bg-white p-2 text-xs text-[#3d4f46]">{detail.goal}</p>
              </div>

              {detail.plan && detail.plan.subtasks.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">计划</p>
                  <div className="space-y-1">
                    {detail.plan.subtasks.map((s, i) => (
                      <div
                        key={s.id ?? i}
                        className="flex items-center gap-2 rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            s.status === "done"
                              ? "bg-green-500"
                              : s.status === "running"
                                ? "bg-blue-500"
                                : s.status === "skipped"
                                  ? "bg-gray-300"
                                  : "bg-[#1a5632]/15"
                          }`}
                        />
                        <span className="text-[#3d4f46]">{i + 1}. {s.title}</span>
                        <span className="ml-auto text-[9px] text-[#9aa8a0]">{s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.errorMessage && (
                <div>
                  <p className="text-[10px] font-semibold text-red-600">错误信息</p>
                  <p className="whitespace-pre-wrap rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                    {detail.errorMessage}
                  </p>
                </div>
              )}

              {detail.uiTranscript && detail.uiTranscript.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">执行记录</p>
                  <TranscriptTimeline transcript={detail.uiTranscript} />
                </div>
              )}

              {detail.status === "running" && (
                <Button
                  size="sm" variant="destructive" className="gap-1"
                  disabled={interrupting === detail.id}
                  onClick={() => void doInterrupt(detail.id)}
                >
                  {interrupting === detail.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  强制中断
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <AdminPagination meta={meta} onPageChange={setPage} />
    </div>
  );
}
