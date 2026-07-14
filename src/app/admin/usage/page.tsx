"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Clock, Activity, Download } from "lucide-react";
import { getAdminUsage, getAdminUsageTrends, type AdminUsageStats, type AdminUsageTrends } from "@/services/admin";
import { exportUsageCSV } from "@/lib/admin-export";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminMetricStrip } from "@/components/admin/admin-stat-card";
import { AdminPanel } from "@/components/admin/admin-panel";
import { AdminBarChart, AdminHBarChart } from "@/components/admin/admin-bar-chart";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN");
}

export default function AdminUsagePage() {
  const [data, setData] = useState<AdminUsageStats | null>(null);
  const [trends, setTrends] = useState<AdminUsageTrends | null>(null);
  const [trendRange, setTrendRange] = useState<"30d" | "12w">("30d");
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminUsage()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTrendsLoading(true);
    getAdminUsageTrends(trendRange)
      .then(setTrends)
      .catch(() => setTrends(null))
      .finally(() => setTrendsLoading(false));
  }, [trendRange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a5632]/50" />
        <p className="text-xs text-[#9aa8a0]">聚合用量数据…</p>
      </div>
    );
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const handleExport = () => {
    exportUsageCSV(
      data.recent.map((entry) => ({
        feature: entry.feature,
        userId: entry.userLabel ?? entry.userId ?? "—",
        timestamp: formatTime(entry.timestamp),
      })),
    );
  };

  const trendPoints = trends?.points ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="使用统计"
        subtitle="AI 功能调用分布与历史趋势"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs gap-1 bg-white/70">
            <Download className="h-3.5 w-3.5" />
            导出 CSV
          </Button>
        }
      />

      <AdminMetricStrip
        items={[
          { label: "总调用", value: data.totalEntries, icon: Activity },
          { label: "功能数", value: data.stats.length, icon: BarChart3 },
          { label: "最近记录", value: data.recent.length, icon: Clock },
        ]}
      />

      <AdminPanel
        title="调用趋势"
        subtitle={trendRange === "30d" ? "近 30 日" : "近 12 周"}
        actions={
          <div className="flex gap-1 rounded-lg border border-[#1a5632]/10 bg-white/60 p-0.5">
            {(["30d", "12w"] as const).map((range) => (
              <Button
                key={range}
                variant={trendRange === range ? "default" : "ghost"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setTrendRange(range)}
              >
                {range === "30d" ? "30 日" : "12 周"}
              </Button>
            ))}
          </div>
        }
      >
        {trendsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>
        ) : (
          <AdminBarChart
            variant="area"
            points={trendPoints.map((p) => ({
              label: p.date.slice(5),
              value: p.count,
            }))}
            emptyText="暂无趋势数据"
          />
        )}
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="功能分布">
          <AdminHBarChart
            items={data.stats.map((s) => ({ label: s.feature, value: s.count }))}
          />
        </AdminPanel>

        <AdminPanel title="最近调用" subtitle="最新 100 条">
          {data.recent.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无记录</p>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto custom-scrollbar">
              {data.recent.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-[#1a5632]/8 bg-[#faf9f6]/60 px-3 py-2 text-xs transition-colors hover:border-[#1a5632]/20"
                >
                  <span className="shrink-0 tabular-nums text-[#9aa8a0]">{formatTime(entry.timestamp).slice(5, 16)}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{entry.feature}</Badge>
                  <span className="min-w-0 truncate text-[#6b7c72]">{entry.userLabel ?? entry.userId ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </div>

      <p className="text-xs text-[#9aa8a0]">
        需要更细粒度分析？前往 <Link href="/admin" className="text-[#1a5632] hover:underline">仪表盘</Link> 查看 Top 用户与项目趋势。
      </p>
    </div>
  );
}
