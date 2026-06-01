"use client";

import { useEffect, useState } from "react";
import { Users, FileText, Database, Search, Clock, Loader2, Sparkles, TrendingUp } from "lucide-react";

interface Stats {
  userCount: number; projectCount: number; knowledgeFileCount: number; knowledgeChunkCount: number;
  plagiarismCount: number; reviewCount: number;
  filesByCategory: { category: string; count: number }[];
  projectsByTemplate: { template: string; count: number }[];
  projectTrend: { date: string; count: number }[];
  recentActivity: { title: string; user: string; time: string }[];
  aiUsage?: { totalCalls: number; todayCount: number; weekCount: number; byFeature: Record<string, number>; topUsers: { userId: string; count: number }[] };
}

function formatTime(iso: string) {
  const d = new Date(iso); const now = Date.now(); const diff = now - d.getTime();
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

const TPL_LABEL: Record<string, string> = { sci: "SCI", ieee: "IEEE", gbt7713: "GB/T 7713", nature: "Nature" };

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats").then(r => { if (!r.ok) throw new Error("unauthorized"); return r.json(); })
      .then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;
  if (!stats) return <div className="text-center text-sm text-[#6b7c72] py-20">加载失败</div>;

  const statCards = [
    { label: "用户总数", value: stats.userCount, icon: Users, color: "text-blue-500" },
    { label: "论文项目", value: stats.projectCount, icon: FileText, color: "text-[#1a5632]" },
    { label: "知识库文献", value: stats.knowledgeFileCount, icon: Database, color: "text-amber-600" },
    { label: "审查记录", value: stats.reviewCount, icon: Search, color: "text-purple-500" },
  ];

  const aiCards = stats.aiUsage ? [
    { label: "AI 总调用", value: stats.aiUsage.totalCalls, icon: Sparkles },
    { label: "今日调用", value: stats.aiUsage.todayCount, icon: TrendingUp },
    { label: "本周调用", value: stats.aiUsage.weekCount, icon: Clock },
  ] : [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-[#122820]">仪表盘</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(card => (
          <div key={card.label} className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-[#6b7c72]"><card.icon className={`h-4 w-4 ${card.color}`} />{card.label}</div>
            <p className="mt-2 text-2xl font-bold text-[#122820]">{(card.value ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {stats.aiUsage && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {aiCards.map(card => (
              <div key={card.label} className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-[#6b7c72]"><card.icon className="h-4 w-4 text-[#1a5632]" />{card.label}</div>
                <p className="mt-2 text-xl font-bold text-[#122820]">{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* AI 功能分布 + Top 用户 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
              <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">AI 功能调用分布</h2>
              {Object.keys(stats.aiUsage.byFeature).length === 0 ? <p className="text-xs text-[#9aa8a0]">暂无数据</p> : (
                <div className="space-y-2">
                  {Object.entries(stats.aiUsage.byFeature).sort(([,a],[,b]) => b - a).slice(0, 8).map(([feature, count]) => {
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
                      <span className="flex-1 truncate text-xs text-[#3d4f46]">{u.userId}</span>
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
            {stats.projectTrend.map(day => {
              const max = Math.max(...stats.projectTrend.map(d => d.count), 1);
              const h = (day.count / max) * 100;
              return <div key={day.date} className="flex flex-1 flex-col items-center gap-1"><span className="text-[10px] text-[#9aa8a0]">{day.count}</span><div className="w-full rounded-t bg-[#1a5632]/70 transition-all" style={{ height: `${Math.max(h, 4)}%` }} /><span className="text-[9px] text-[#9aa8a0]">{day.date.slice(5)}</span></div>;
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">文献分类分布</h2>
          <div className="space-y-2">
            {stats.filesByCategory.slice(0, 6).map(cat => {
              const max = Math.max(...stats.filesByCategory.map(c => c.count), 1);
              return <div key={cat.category} className="flex items-center gap-2"><span className="w-20 truncate text-xs text-[#3d4f46]">{cat.category || "未分类"}</span><div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden"><div className="h-full rounded bg-[#1a5632]/60" style={{ width: `${(cat.count / max) * 100}%` }} /></div><span className="text-[10px] text-[#9aa8a0] w-8 text-right">{cat.count}</span></div>;
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">项目模板分布</h2>
          <div className="space-y-2">
            {stats.projectsByTemplate.map(t => {
              const max = Math.max(...stats.projectsByTemplate.map(x => x.count), 1);
              return <div key={t.template} className="flex items-center gap-2"><span className="w-20 text-xs text-[#3d4f46]">{TPL_LABEL[t.template] ?? t.template}</span><div className="flex-1 h-4 rounded bg-[#1a5632]/8 overflow-hidden"><div className="h-full rounded bg-blue-400/60" style={{ width: `${(t.count / max) * 100}%` }} /></div><span className="text-[10px] text-[#9aa8a0] w-8 text-right">{t.count}</span></div>;
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-white p-4">
          <h2 className="mb-3 text-xs font-medium text-[#6b7c72]">最近活动</h2>
          <div className="space-y-3">
            {stats.recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9aa8a0]" /><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#3d4f46]"><span className="font-medium">{a.user}</span> 更新了 <span className="font-medium">{a.title || "未命名"}</span></p><p className="text-[10px] text-[#9aa8a0]">{formatTime(a.time)}</p></div></div>
            ))}
            {stats.recentActivity.length === 0 && <p className="text-xs text-[#9aa8a0]">暂无活动</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
