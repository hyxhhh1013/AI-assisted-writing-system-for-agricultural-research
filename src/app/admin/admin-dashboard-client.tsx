"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, Database, Search, Clock, Loader2, Sparkles, TrendingUp,
  Heart, Settings, Upload, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminStats, getAdminHealth, type AdminStats } from "@/services/admin";
import type { AdminHealthData } from "@/contracts/admin";
import { adminModeLabel, adminTplLabel } from "@/lib/admin-labels";

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

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;
  if (!stats) return <div className="text-center text-sm text-[#6b7c72] py-20">加载失败</div>;

  const alerts: string[] = [];
  if (health && !health.db.connected) alerts.push("数据库连接异常");
  if (health && health.knowledge.uncategorizedCount > 50) {
    alerts.push(`${health.knowledge.uncategorizedCount} 篇文献未分类`);
  }

  const statCards = [
    { label: "用户总数", value: stats.userCount, icon: Users, color: "text-blue-500", href: "/admin/users" },
    { label: "论文项目", value: stats.projectCount, icon: FileText, color: "text-[#1a5632]", href: "/admin/projects" },
    { label: "知识库文献", value: stats.knowledgeFileCount, icon: Database, color: "text-amber-600", href: "/admin/knowledge" },
    { label: "审查记录", value: stats.reviewCount, icon: Search, color: "text-purple-500", href: "/admin/reviews" },
  ];

  const aiCards = stats.aiUsage ? [
    { label: "AI 总调用", value: stats.aiUsage.totalCalls, icon: Sparkles },
    { label: "今日调用", value: stats.aiUsage.todayCount, icon: TrendingUp },
    { label: "本周调用", value: stats.aiUsage.weekCount, icon: Clock },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-[#122820]">仪表盘</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/knowledge"><Button variant="outline" size="sm" className="h-8 text-xs gap-1"><Upload className="h-3.5 w-3.5" />上传文献</Button></Link>
          <Link href="/admin/health"><Button variant="outline" size="sm" className="h-8 text-xs gap-1"><Heart className="h-3.5 w-3.5" />系统健康</Button></Link>
          <Link href="/admin/settings"><Button variant="outline" size="sm" className="h-8 text-xs gap-1"><Settings className="h-3.5 w-3.5" />API 设置</Button></Link>
          <Link href="/admin/usage"><Button variant="outline" size="sm" className="h-8 text-xs">使用统计</Button></Link>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">需要关注</p>
            <ul className="mt-1 text-xs space-y-0.5">
              {alerts.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-[#1a5632]/10 bg-white p-4 hover:border-[#1a5632]/25 transition-colors">
            <div className="flex items-center gap-2 text-xs text-[#6b7c72]"><card.icon className={`h-4 w-4 ${card.color}`} />{card.label}</div>
            <p className="mt-2 text-2xl font-bold text-[#122820]">{(card.value ?? 0).toLocaleString()}</p>
          </Link>
        ))}
      </div>

      {stats.aiUsage && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {aiCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-[#6b7c72]"><card.icon className="h-4 w-4 text-[#1a5632]" />{card.label}</div>
                <p className="mt-2 text-xl font-bold text-[#122820]">{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
              <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">AI 功能调用分布</h2>
              {Object.keys(stats.aiUsage.byFeature).length === 0 ? <p className="text-xs text-[#9aa8a0]">暂无数据</p> : (
                <div className="space-y-2">
                  {Object.entries(stats.aiUsage.byFeature).sort(([, a], [, b]) => b - a).slice(0, 8).map(([feature, count]) => {
                    const max = Math.max(...Object.values(stats.aiUsage!.byFeature), 1);
                    return (
                      <div key={feature} className="flex items-center gap-2">
                        <span className="w-24 truncate text-xs text-[#3d4f46]">{feature}</span>
                        <div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden"><div className="h-full rounded bg-[#1a5632]/60" style={{ width: `${(count / max) * 100}%` }} /></div>
                        <span className="text-[10px] text-[#9aa8a0] w-10 text-right tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
              <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">用户 AI 用量 Top 10</h2>
              {stats.aiUsage.topUsers.length === 0 ? <p className="text-xs text-[#9aa8a0]">暂无数据</p> : (
                <div className="space-y-2">
                  {stats.aiUsage.topUsers.map((u, i) => (
                    <div key={u.userId} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#9aa8a0] w-5 text-right tabular-nums">{i + 1}</span>
                      <span className="flex-1 truncate text-xs text-[#3d4f46]">{u.userName ?? u.userId}</span>
                      <span className="text-xs text-[#1a5632] font-medium tabular-nums">{u.count} 次</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">近 7 天新建项目</h2>
          <div className="flex items-end gap-1 h-32">
            {stats.projectTrend.map((day) => {
              const max = Math.max(...stats.projectTrend.map((d) => d.count), 1);
              const h = (day.count / max) * 100;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-[#9aa8a0]">{day.count}</span>
                  <div className="w-full rounded-t bg-[#1a5632]/70 transition-all" style={{ height: `${Math.max(h, 4)}%` }} />
                  <span className="text-[9px] text-[#9aa8a0]">{day.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">文献分类分布</h2>
          <div className="space-y-2">
            {stats.filesByCategory.slice(0, 6).map((cat) => {
              const max = Math.max(...stats.filesByCategory.map((c) => c.count), 1);
              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className="w-20 truncate text-xs text-[#3d4f46]">{cat.category || "未分类"}</span>
                  <div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden"><div className="h-full rounded bg-[#1a5632]/60" style={{ width: `${(cat.count / max) * 100}%` }} /></div>
                  <span className="text-[10px] text-[#9aa8a0] w-8 text-right">{cat.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">项目模板分布</h2>
          <div className="space-y-2">
            {stats.projectsByTemplate.map((t) => {
              const max = Math.max(...stats.projectsByTemplate.map((x) => x.count), 1);
              return (
                <div key={t.template} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-[#3d4f46]">{adminTplLabel(t.template)}</span>
                  <div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden"><div className="h-full rounded bg-blue-400/60" style={{ width: `${(t.count / max) * 100}%` }} /></div>
                  <span className="text-[10px] text-[#9aa8a0] w-8 text-right">{t.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">写作模式分布</h2>
          <div className="space-y-2">
            {(stats.projectsByMode ?? []).map((m) => {
              const max = Math.max(...(stats.projectsByMode ?? []).map((x) => x.count), 1);
              return (
                <div key={m.mode} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-[#3d4f46]">{adminModeLabel(m.mode)}</span>
                  <div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden">
                    <div className="h-full rounded bg-emerald-500/60" style={{ width: `${(m.count / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-[#9aa8a0] w-8 text-right">{m.count}</span>
                </div>
              );
            })}
            {(stats.projectsByMode ?? []).length === 0 && <p className="text-xs text-[#9aa8a0]">暂无数据</p>}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">最近活动</h2>
          <div className="space-y-3">
            {stats.recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9aa8a0]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[#3d4f46]">
                    <span className="font-medium">{a.user}</span> 更新了 <span className="font-medium">{a.title || "未命名"}</span>
                  </p>
                  <p className="text-[10px] text-[#9aa8a0]">{formatTime(a.time)}</p>
                </div>
              </div>
            ))}
            {stats.recentActivity.length === 0 && <p className="text-xs text-[#9aa8a0]">暂无活动</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
