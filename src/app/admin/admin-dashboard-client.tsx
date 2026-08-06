"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, Database, Search, Clock, Loader2, Heart, ArrowRight,
  Compass, Bot, AlertTriangle, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminStats, getAdminHealth, type AdminStats } from "@/services/admin";
import type { AdminHealthData } from "@/contracts/admin";
import { adminModeLabel, adminTplLabel } from "@/lib/admin-labels";
import { AdminHeroBand } from "@/components/admin/admin-hero-band";
import { AdminPanel, AdminCompactList } from "@/components/admin/admin-panel";
import { AdminBarChart, AdminHBarChart } from "@/components/admin/admin-bar-chart";
import { AdminMetricStrip } from "@/components/admin/admin-stat-card";
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

  const alerts: { message: string; href: string; label: string }[] = [];
  if (health && !health.db.connected) {
    alerts.push({ message: "数据库连接异常", href: "/admin/settings", label: "检查配置" });
  }
  if (health && health.knowledge.uncategorizedCount > 0) {
    alerts.push({
      message: `${health.knowledge.uncategorizedCount} 篇文献未分类`,
      href: "/admin/knowledge?category=未分类",
      label: "去整理",
    });
  }
  if (health && health.index.indexFiles.length === 0) {
    alerts.push({ message: "RAG 索引文件缺失", href: "/admin/knowledge", label: "重建索引" });
  }

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

  const featureItems = stats.aiUsage
    ? Object.entries(stats.aiUsage.byFeature)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([label, value]) => ({ label, value }))
    : [];

  const userItems = stats.aiUsage
    ? stats.aiUsage.topUsers.slice(0, 5).map((u) => ({
        label: u.userName ?? u.userId,
        value: `${u.count} 次`,
      }))
    : [];

  const sessionTrend = (stats.agentSessionTrend ?? []).map((d) => ({
    label: d.date.slice(5),
    value: d.count,
  }));
  const statusItems = (stats.agentSessionByStatus ?? [])
    .map((s) => ({
      label: ADMIN_SESSION_STATUS_LABEL[s.status] ?? s.status,
      value: s.count,
    }))
    .sort((a, b) => b.value - a.value);
  const recentDirItems = (stats.recentDirections ?? []).map((d) => ({
    label: d.name,
    value: formatTime(d.time),
    hint: d.status === "active" ? "启用" : "已归档",
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#122820]">运维概览</h1>
          <p className="text-sm text-[#6b7c72]">实验室运行状态一览</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/knowledge"><Button variant="outline" size="sm" className="h-8 text-xs">上传文献</Button></Link>
          <Link href="/admin/health"><Button variant="outline" size="sm" className="h-8 text-xs gap-1"><Heart className="h-3.5 w-3.5" />健康</Button></Link>
          <Link href="/admin/usage"><Button size="sm" className="h-8 text-xs bg-[#1a5632]">用量详情</Button></Link>
        </div>
      </div>

      <AdminAlertStrip alerts={alerts} />

      <AdminHeroBand
        metrics={[
          { label: "文献", value: stats.knowledgeFileCount, icon: Database, href: "/admin/knowledge" },
          { label: "项目", value: stats.projectCount, icon: FileText, href: "/admin/projects" },
          { label: "用户", value: stats.userCount, icon: Users, href: "/admin/users" },
          { label: "审查", value: stats.reviewCount, icon: Search, href: "/admin/reviews" },
        ]}
        aiLine={aiLine}
      />

      <AdminMetricStrip
        items={[
          { label: "研究方向", value: stats.directionCount, icon: Compass, href: "/admin/directions" },
          { label: "Agent 会话", value: stats.agentSessionCount, icon: Bot, href: "/admin/agent-sessions" },
          { label: "Agent 出错", value: stats.agentSessionErrorCount, icon: AlertTriangle, href: "/admin/agent-sessions?status=error" },
          { label: "分析记录", value: stats.analysisCount, icon: BarChart3 },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* 主栏：动态 + 趋势 */}
        <div className="space-y-5 lg:col-span-3">
          <AdminPanel title="最近活动" subtitle="项目更新记录">
            {stats.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无活动</p>
            ) : (
              <ul className="space-y-3">
                {stats.recentActivity.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-lg border border-[#1a5632]/8 bg-[#fafbfa] px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5632]/10">
                      <Clock className="h-3.5 w-3.5 text-[#1a5632]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#3d4f46]">
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

          {weekNewProjects > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-[#1a5632]/10 bg-white px-4 py-3">
              <div>
                <p className="text-xs text-[#9aa8a0]">近 7 天新建项目</p>
                <p className="text-xl font-semibold tabular-nums text-[#122820]">
                  {weekNewProjects}
                  <span className="ml-1 text-sm font-normal text-[#6b7c72]">个</span>
                </p>
              </div>
              {sparseTrend ? (
                <AdminSparkline
                  points={projectTrend.map((p) => p.value)}
                  width={140}
                  height={36}
                />
              ) : (
                <div className="w-48">
                  <AdminBarChart variant="bar" points={projectTrend} height={80} />
                </div>
              )}
              <Link href="/admin/projects" className="text-[#1a5632] hover:text-[#143d28]">
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>

        {/* 侧栏：静态分布 */}
        <div className="space-y-5 lg:col-span-2">
          <AdminPanel title="文献分类" subtitle="Top 6">
            <AdminHBarChart items={categoryItems} maxItems={6} />
          </AdminPanel>

          {stats.aiUsage && (featureItems.length > 0 || userItems.length > 0) && (
            <AdminPanel title="AI 用量快照">
              {featureItems.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-[10px] font-medium text-[#9aa8a0]">功能</p>
                  <AdminCompactList items={featureItems.map((f) => ({ label: f.label, value: f.value }))} />
                </div>
              )}
              {userItems.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-medium text-[#9aa8a0]">用户</p>
                  <AdminCompactList items={userItems} />
                </div>
              )}
              <Link href="/admin/usage" className="mt-3 inline-flex items-center gap-1 text-xs text-[#1a5632] hover:underline">
                查看完整统计 <ArrowRight className="h-3 w-3" />
              </Link>
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

          {(sessionTrend.some((t) => t.value > 0) || statusItems.length > 0) && (
            <AdminPanel title="Agent 会话概览" subtitle="近 7 天">
              {sessionTrend.some((t) => t.value > 0) && (
                <AdminBarChart variant="bar" points={sessionTrend} height={80} />
              )}
              {statusItems.length > 0 && (
                <div className="mt-3">
                  <AdminCompactList items={statusItems} />
                </div>
              )}
              <Link href="/admin/agent-sessions" className="mt-3 inline-flex items-center gap-1 text-xs text-[#1a5632] hover:underline">
                查看会话 <ArrowRight className="h-3 w-3" />
              </Link>
            </AdminPanel>
          )}

          {recentDirItems.length > 0 && (
            <AdminPanel title="方向活跃" subtitle="最近更新">
              <AdminCompactList items={recentDirItems} />
              <Link href="/admin/directions" className="mt-3 inline-flex items-center gap-1 text-xs text-[#1a5632] hover:underline">
                管理方向 <ArrowRight className="h-3 w-3" />
              </Link>
            </AdminPanel>
          )}
        </div>
      </div>
    </div>
  );
}
