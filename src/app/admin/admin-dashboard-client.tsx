"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, Database, Search, Clock, Loader2, Heart, ArrowRight,
  Compass, Bot, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminStats, getAdminHealth, type AdminStats } from "@/services/admin";
import type { AdminHealthData } from "@/contracts/admin";
import { buildAdminHealthAlerts } from "@/lib/admin-health-alerts";
import { adminFeatureLabel, adminModeLabel, adminTplLabel } from "@/lib/admin-labels";
import { AdminHeroBand } from "@/components/admin/admin-hero-band";
import { AdminPanel, AdminCompactList } from "@/components/admin/admin-panel";
import { AdminHBarChart } from "@/components/admin/admin-bar-chart";
import { AdminAlertStrip } from "@/components/admin/admin-alert-strip";
import { AdminSparkline, isSparseTrend } from "@/components/admin/admin-sparkline";

const ADMIN_SESSION_STATUS_LABEL: Record<string, string> = {
  running: "运行中",
  interrupted: "已中断",
  completed: "已完成",
  error: "出错",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminHealth()])
      .then(([s, h]) => {
        setStats(s);
        setHealth(h);
      })
      .catch(() => toast.error("仪表盘加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2">
        <Loader2 className="h-7 w-7 animate-spin text-[#1a5632]/40" />
        <p className="text-xs text-[#9aa8a0]">加载中…</p>
      </div>
    );
  }
  if (!stats) return <div className="py-20 text-center text-sm text-[#6b7c72]">加载失败</div>;

  const alerts = health ? buildAdminHealthAlerts(health) : [];

  const projectTrend = stats.projectTrend.map((d) => ({
    label: d.date.slice(5),
    value: d.count,
  }));
  const weekNewProjects = projectTrend.reduce((s, p) => s + p.value, 0);
  const sparseTrend = isSparseTrend(projectTrend);

  const categoryItems = stats.filesByCategory.slice(0, 6).map((c) => ({
    label: c.category || "未分类",
    value: c.count,
  }));

  const aiLine = stats.aiUsage
    ? `AI 调用：总计 ${stats.aiUsage.totalCalls} · 今日 ${stats.aiUsage.todayCount} · 本周 ${stats.aiUsage.weekCount}`
    : undefined;

  const wq = stats.writingQueue;
  const showWritingQueue = Boolean(
    wq && (wq.waitCount > 0 || wq.timeoutCount > 0),
  );
  const writingQueueItems = showWritingQueue && wq
    ? [
        { label: "并发上限", value: wq.maxConcurrent },
        { label: "排队次数", value: wq.waitCount },
        {
          label: "平均等待",
          value: wq.waitCount > 0 ? `${Math.round(wq.waitMs / wq.waitCount)}ms` : "—",
        },
        { label: "超时次数", value: wq.timeoutCount },
      ]
    : [];

  const featureItems = stats.aiUsage
    ? Object.entries(stats.aiUsage.byFeature)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([label, value]) => ({ label: adminFeatureLabel(label), value }))
    : [];

  const userItems = stats.aiUsage
    ? stats.aiUsage.topUsers.slice(0, 5).map((u) => ({
        label: u.userName ?? u.userId,
        value: `${u.count} 次`,
      }))
    : [];

  const statusItems = (stats.agentSessionByStatus ?? [])
    .map((s) => ({
      label: ADMIN_SESSION_STATUS_LABEL[s.status] ?? s.status,
      value: s.count,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#122820]">运维概览</h1>
          <p className="text-sm text-[#6b7c72]">关键数字与告警，细节进各子页</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/health">
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <Heart className="h-3.5 w-3.5" />
              健康
            </Button>
          </Link>
          <Link href="/admin/knowledge">
            <Button variant="outline" size="sm" className="h-8 text-xs">文献</Button>
          </Link>
          <Link href="/admin/usage">
            <Button size="sm" className="h-8 bg-[#1a5632] text-xs">用量</Button>
          </Link>
        </div>
      </div>

      <AdminAlertStrip alerts={alerts} />

      <AdminHeroBand
        metrics={[
          { label: "文献", value: stats.knowledgeFileCount, icon: Database, href: "/admin/knowledge" },
          { label: "项目", value: stats.projectCount, icon: FileText, href: "/admin/projects" },
          { label: "用户", value: stats.userCount, icon: Users, href: "/admin/users" },
          { label: "审查", value: stats.reviewCount, icon: Search, href: "/admin/reviews" },
          { label: "方向", value: stats.directionCount, icon: Compass, href: "/admin/directions" },
          {
            label: "Agent",
            value: stats.agentSessionCount,
            icon: Bot,
            href: "/admin/agent-sessions",
          },
          {
            label: "出错",
            value: stats.agentSessionErrorCount,
            icon: AlertTriangle,
            href: "/admin/agent-sessions?status=error",
          },
        ]}
        aiLine={aiLine}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <AdminPanel
            title="最近活动"
            subtitle="项目更新"
            actions={
              weekNewProjects > 0 ? (
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <p className="text-[10px] text-[#9aa8a0]">近 7 天新建</p>
                    <p className="text-sm font-semibold tabular-nums text-[#122820]">
                      {weekNewProjects}
                    </p>
                  </div>
                  {sparseTrend && (
                    <AdminSparkline
                      points={projectTrend.map((p) => p.value)}
                      width={72}
                      height={28}
                    />
                  )}
                </div>
              ) : undefined
            }
          >
            {stats.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无活动</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.recentActivity.slice(0, 6).map((a, i) => (
                  <li
                    key={`${a.time}-${i}`}
                    className="flex gap-3 rounded-lg border border-[#1a5632]/8 bg-[#fafbfa] px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5632]/10">
                      <Clock className="h-3.5 w-3.5 text-[#1a5632]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#3d4f46]">
                        <span className="font-medium text-[#122820]">{a.user}</span>
                        {" "}更新了 {a.title || "未命名项目"}
                      </p>
                      <p className="text-[11px] text-[#9aa8a0]">{formatTime(a.time)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <AdminPanel title="文献分类" subtitle="Top 6">
            <AdminHBarChart items={categoryItems} maxItems={6} />
          </AdminPanel>

          {stats.aiUsage && (featureItems.length > 0 || userItems.length > 0) && (
            <AdminPanel
              title="AI 用量"
              actions={
                <Link
                  href="/admin/usage"
                  className="inline-flex items-center gap-1 text-xs text-[#1a5632] hover:underline"
                >
                  详情 <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              }
            >
              {featureItems.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-medium text-[#9aa8a0]">模型</p>
                  <AdminCompactList items={featureItems.map((f) => ({ label: f.label, value: f.value }))} />
                </div>
              )}
              {userItems.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-[#9aa8a0]">用户</p>
                  <AdminCompactList items={userItems} />
                </div>
              )}
            </AdminPanel>
          )}

          {(stats.projectsByTemplate.length > 0 || (stats.projectsByMode ?? []).length > 0) && (
            <AdminPanel title="项目构成">
              <AdminCompactList
                items={[
                  ...stats.projectsByTemplate.map((t) => ({
                    label: adminTplLabel(t.template),
                    value: t.count,
                    hint: "模板",
                  })),
                  ...(stats.projectsByMode ?? []).map((m) => ({
                    label: adminModeLabel(m.mode),
                    value: m.count,
                    hint: "模式",
                  })),
                ]}
              />
            </AdminPanel>
          )}

          {statusItems.length > 0 && (
            <AdminPanel
              title="Agent 状态"
              actions={
                <Link
                  href="/admin/agent-sessions"
                  className="inline-flex items-center gap-1 text-xs text-[#1a5632] hover:underline"
                >
                  会话 <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              }
            >
              <AdminCompactList items={statusItems} />
            </AdminPanel>
          )}

          {writingQueueItems.length > 0 && (
            <AdminPanel title="扩写排队" subtitle="仅在有排队/超时时显示">
              <AdminCompactList items={writingQueueItems} />
            </AdminPanel>
          )}
        </div>
      </div>
    </div>
  );
}
