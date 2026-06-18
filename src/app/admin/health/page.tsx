"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Database, FileText, HardDrive, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminHealth, type AdminHealthData } from "@/services/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanel } from "@/components/admin/admin-panel";
import { AdminRingMetric } from "@/components/admin/admin-ring-metric";
import { AdminAlertStrip } from "@/components/admin/admin-alert-strip";
import { AdminMetricStrip } from "@/components/admin/admin-stat-card";

export default function AdminHealthPage() {
  const [data, setData] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminHealth().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a5632]/50" />
        <p className="text-xs text-[#9aa8a0]">检测系统状态…</p>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-red-600">加载失败</div>;

  const fmtBytes = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
  const uptimeStr = `${Math.floor(data.server.uptime / 3600)}h ${Math.floor((data.server.uptime % 3600) / 60)}m`;

  const categorizedPct = data.knowledge.fileCount > 0
    ? Math.round(((data.knowledge.fileCount - data.knowledge.uncategorizedCount) / data.knowledge.fileCount) * 100)
    : 100;
  const indexPct = data.index.indexFiles.length > 0 ? 100 : 0;

  const alerts: { message: string; href: string; label: string }[] = [];
  if (!data.db.connected) {
    alerts.push({ message: "数据库连接异常", href: "/admin/settings", label: "检查配置" });
  }
  if (data.knowledge.uncategorizedCount > 0) {
    alerts.push({
      message: `${data.knowledge.uncategorizedCount} 篇文献未分类`,
      href: "/admin/knowledge?category=未分类",
      label: "去整理",
    });
  }
  if (data.index.indexFiles.length === 0) {
    alerts.push({ message: "RAG 索引文件缺失", href: "/admin/knowledge", label: "重建索引" });
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="系统健康" subtitle="数据库 · 知识库 · 索引 · 运行时" />

      <AdminAlertStrip alerts={alerts} />

      <AdminMetricStrip
        items={[
          { label: "文献", value: data.knowledge.fileCount, icon: FileText },
          { label: "索引文件", value: data.index.indexFiles.length, icon: HardDrive },
          { label: "内存", value: data.server.memoryMB, icon: Server, suffix: "MB" },
          {
            label: data.db.connected ? "数据库" : "DB 异常",
            value: Math.max(1, Math.round(data.db.sizeBytes / 1024 / 1024)),
            icon: Database,
            suffix: "MB",
          },
        ]}
      />

      <AdminPanel title="健康度" subtitle="环形指标">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <AdminRingMetric
            label="数据库"
            value={data.db.connected ? 100 : 0}
            status={data.db.connected ? "ok" : "error"}
          />
          <AdminRingMetric
            label="文献已分类"
            value={categorizedPct}
            status={categorizedPct >= 90 ? "ok" : categorizedPct >= 70 ? "warn" : "error"}
          />
          <AdminRingMetric
            label="索引就绪"
            value={indexPct}
            status={indexPct === 100 ? "ok" : "error"}
          />
          <AdminRingMetric
            label="内存占用"
            value={data.server.memoryMB}
            max={1024}
            unit="MB"
            status={data.server.memoryMB < 768 ? "ok" : "warn"}
            color="#6366f1"
          />
        </div>
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="知识库">
          <div className="space-y-2 text-sm text-[#6b7c72]">
            <p>文献 <strong className="text-[#122820]">{data.knowledge.fileCount}</strong> 篇</p>
            <p>
              未分类{" "}
              {data.knowledge.uncategorizedCount > 0 ? (
                <Link href="/admin/knowledge?category=未分类" className="font-semibold text-amber-700 hover:underline">
                  {data.knowledge.uncategorizedCount} 篇 →
                </Link>
              ) : (
                <span className="text-[#1a5632]">无</span>
              )}
            </p>
            <p className="text-xs text-[#9aa8a0]">Node {data.server.nodeVersion} · 运行 {uptimeStr} · {fmtBytes(data.index.totalSizeBytes)} 索引</p>
          </div>
        </AdminPanel>

        <AdminPanel title="索引文件">
          {data.index.indexFiles.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#9aa8a0]">无索引文件</p>
              <Link href="/admin/knowledge">
                <Button variant="outline" size="sm" className="h-7 text-xs">前往文献管理</Button>
              </Link>
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {data.index.indexFiles.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-lg border border-[#1a5632]/8 bg-[#faf9f6]/60 px-3 py-2 text-xs text-[#6b7c72]">
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
