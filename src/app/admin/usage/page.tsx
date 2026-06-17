"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Clock, Activity, Download } from "lucide-react";
import { getAdminUsage, getAdminUsageTrends, type AdminUsageStats, type AdminUsageTrends } from "@/services/admin";
import { exportUsageCSV } from "@/lib/admin-export";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

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
      <div className="flex items-center gap-2 text-sm text-[#6b7c72]">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

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
        subtitle="AI 功能调用分布与最近记录（持久化至数据库，支持历史查询）"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs gap-1">
            <Download className="h-3.5 w-3.5" />
            导出 CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#1a5632]" />
              总调用次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#122820]">{data.totalEntries.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#1a5632]" />
              功能数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#122820]">{data.stats.length}</p>
          </CardContent>
        </Card>
        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#1a5632]" />
              最近记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#122820]">{data.recent.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#1a5632]/10">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">调用趋势</CardTitle>
          <div className="flex gap-1">
            {(["30d", "12w"] as const).map((range) => (
              <Button
                key={range}
                variant={trendRange === range ? "default" : "ghost"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setTrendRange(range)}
              >
                {range === "30d" ? "近 30 日" : "近 12 周"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#6b7c72]" /></div>
          ) : trendPoints.length === 0 ? (
            <p className="text-sm text-[#9aa8a0] py-8 text-center">暂无趋势数据</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {trendPoints.map((point) => {
                const max = Math.max(...trendPoints.map((d) => d.count), 1);
                const h = (point.count / max) * 100;
                return (
                  <div key={point.date} className="flex flex-1 flex-col items-center gap-1 min-w-0">
                    <span className="text-[10px] text-[#9aa8a0]">{point.count}</span>
                    <div className="w-full rounded-t bg-[#1a5632]/70 transition-all" style={{ height: `${Math.max(h, 4)}%` }} />
                    <span className="text-[9px] text-[#9aa8a0] truncate w-full text-center">
                      {trendRange === "12w" ? point.date.slice(5) : point.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#1a5632]/10">
        <CardHeader>
          <CardTitle className="text-sm">功能调用分布</CardTitle>
        </CardHeader>
        <CardContent>
          {data.stats.length === 0 ? (
            <p className="text-sm text-[#9aa8a0] py-8 text-center">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {data.stats.map(({ feature, count }, i) => {
                const pct = data.totalEntries > 0 ? (count / data.totalEntries) * 100 : 0;
                return (
                  <div key={feature} className="flex items-center gap-3">
                    <span className="text-[10px] text-[#9aa8a0] w-6 text-right tabular-nums">{i + 1}</span>
                    <Badge variant="outline" className="text-[10px] w-24 justify-center truncate">{feature}</Badge>
                    <div className="flex-1 h-5 rounded-full bg-[#1a5632]/8 overflow-hidden">
                      <div className="h-full rounded-full bg-[#1a5632] transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-xs text-[#122820] font-medium tabular-nums w-12 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#1a5632]/10">
        <CardHeader>
          <CardTitle className="text-sm">最近调用（最新 100 条）</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-[#9aa8a0] py-8 text-center">暂无记录</p>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[#1a5632]/10 text-left text-[#6b7c72]">
                    <th className="py-2 font-medium">时间</th>
                    <th className="py-2 font-medium">功能</th>
                    <th className="py-2 font-medium">用户</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((entry, i) => (
                    <tr key={i} className="border-b border-[#1a5632]/5 hover:bg-[#1a5632]/[0.03]">
                      <td className="py-1.5 text-[#9aa8a0] tabular-nums whitespace-nowrap">{formatTime(entry.timestamp)}</td>
                      <td className="py-1.5"><Badge variant="secondary" className="text-[10px]">{entry.feature}</Badge></td>
                      <td className="py-1.5 text-[#6b7c72] truncate max-w-[200px]">{entry.userLabel ?? entry.userId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-[#9aa8a0]">
        需要更细粒度分析？前往 <Link href="/admin" className="text-[#1a5632] hover:underline">仪表盘</Link> 查看 Top 用户与项目趋势。
      </p>
    </div>
  );
}
