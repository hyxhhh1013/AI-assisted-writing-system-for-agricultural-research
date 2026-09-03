"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Database,
  FileText,
  HardDrive,
  Server,
  Bot,
  KeyRound,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminHealth, type AdminHealthData } from "@/services/admin";
import { buildAdminHealthAlerts } from "@/lib/admin-health-alerts";
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

  const fmtBytes = (b: number) =>
    b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
  const uptimeStr = `${Math.floor(data.server.uptime / 3600)}h ${Math.floor((data.server.uptime % 3600) / 60)}m`;

  const categorizedPct =
    data.knowledge.fileCount > 0
      ? Math.round(
          ((data.knowledge.fileCount - data.knowledge.uncategorizedCount)
            / data.knowledge.fileCount)
            * 100,
        )
      : 100;
  const indexPct = data.index.indexFiles.length > 0 ? 100 : 0;
  const aiOkPct =
    data.ai.providers.length > 0
      ? Math.round(
          (data.ai.providers.filter((p) => p.keyCount > 0).length / data.ai.providers.length)
            * 100,
        )
      : 0;

  const alerts = buildAdminHealthAlerts(data);
  const jm = data.journalMetrics;
  const agent = data.agent;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="系统健康" subtitle="数据库 · AI · 知识库 · Agent · 期刊指标" />

      <AdminAlertStrip alerts={alerts} />

      <AdminMetricStrip
        items={[
          { label: "文献", value: data.knowledge.fileCount, icon: FileText },
          { label: "索引文件", value: data.index.indexFiles.length, icon: HardDrive },
          { label: "内存", value: data.server.memoryMB, icon: Server, suffix: "MB" },
          {
            label: data.db.connected ? "数据库" : "DB 异常",
            value: Math.max(0, Math.round(data.db.sizeBytes / 1024 / 1024)),
            icon: Database,
            suffix: "MB",
          },
        ]}
      />

      <AdminPanel title="健康度">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <AdminRingMetric
            label="数据库"
            value={data.db.connected ? 100 : 0}
            status={data.db.connected ? "ok" : "error"}
          />
          <AdminRingMetric
            label="AI Key"
            value={aiOkPct}
            status={aiOkPct === 100 ? "ok" : aiOkPct > 0 ? "warn" : "error"}
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
            label="期刊 IF 覆盖"
            value={jm.coveragePct}
            status={
              jm.fileCount < 10
                ? "ok"
                : jm.coveragePct >= 40
                  ? "ok"
                  : jm.coveragePct >= 20
                    ? "warn"
                    : "error"
            }
          />
          <AdminRingMetric
            label="内存占用"
            value={data.server.memoryMB}
            max={1024}
            unit="MB"
            status={data.server.memoryMB < 768 ? "ok" : "warn"}
          />
        </div>
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="AI 提供商" subtitle="Key 与生效模型">
          <div className="space-y-2">
            {data.ai.providers.map((p) => (
              <div
                key={p.provider}
                className="flex items-center justify-between rounded-lg border border-[#1a5632]/8 bg-[#faf9f6]/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 text-[#122820]">
                  <KeyRound className="h-3.5 w-3.5 text-[#1a5632]" />
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-[#9aa8a0]">{p.model}</span>
                </div>
                <span
                  className={
                    p.keyCount > 0 ? "text-[#1a5632]" : "font-medium text-red-600"
                  }
                >
                  {p.keyCount > 0 ? `${p.keyCount} Key` : "未配置"}
                </span>
              </div>
            ))}
            {data.ai.missingKeyProviders.length > 0 && (
              <Link href="/admin/settings">
                <Button variant="outline" size="sm" className="mt-1 h-7 text-xs">
                  前往设置配置 Key
                </Button>
              </Link>
            )}
          </div>
        </AdminPanel>

        <AdminPanel title="Agent 会话" subtitle="错误与运行中">
          <div className="space-y-2 text-sm text-[#6b7c72]">
            <p className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#1a5632]" />
              总计 <strong className="text-[#122820]">{agent.totalSessions}</strong>
              {" · "}运行中 <strong className="text-[#122820]">{agent.runningSessions}</strong>
            </p>
            <p>
              错误总计{" "}
              {agent.errorSessions > 0 ? (
                <Link
                  href="/admin/agent-sessions?status=error"
                  className="font-semibold text-amber-700 hover:underline"
                >
                  {agent.errorSessions} →
                </Link>
              ) : (
                <span className="text-[#1a5632]">0</span>
              )}
              {" · "}近 24h{" "}
              <strong
                className={
                  agent.errorSessions24h >= 3 ? "text-red-600" : "text-[#122820]"
                }
              >
                {agent.errorSessions24h}
              </strong>
            </p>
          </div>
        </AdminPanel>

        <AdminPanel title="知识库 / 磁盘抽样">
          <div className="space-y-2 text-sm text-[#6b7c72]">
            <p>
              文献 <strong className="text-[#122820]">{data.knowledge.fileCount}</strong> 篇
              {data.knowledge.chunkCount > 0 ? (
                <>
                  {" · "}块 <strong className="text-[#122820]">{data.knowledge.chunkCount}</strong>
                </>
              ) : (
                <span className="text-[#9aa8a0]"> · 分块统计未入库（见索引文件）</span>
              )}
            </p>
            <p>
              未分类{" "}
              {data.knowledge.uncategorizedCount > 0 ? (
                <Link
                  href="/admin/knowledge?category=未分类"
                  className="font-semibold text-amber-700 hover:underline"
                >
                  {data.knowledge.uncategorizedCount} 篇 →
                </Link>
              ) : (
                <span className="text-[#1a5632]">无</span>
              )}
            </p>
            <p className="text-xs text-[#9aa8a0]">
              抽样 {data.knowledge.diskSampleSize} 篇：PDF 缺失{" "}
              <strong className="text-[#122820]">{data.knowledge.pdfMissingInSample}</strong>
              {" · "}仅元数据 {data.knowledge.metadataOnlyInSample}
              {" · "}分类漂移 {data.knowledge.categoryDriftInSample}
            </p>
            <p className="text-xs text-[#9aa8a0]">
              Node {data.server.nodeVersion} · 运行 {uptimeStr} ·{" "}
              {fmtBytes(data.index.totalSizeBytes)} 索引
            </p>
          </div>
        </AdminPanel>

        <AdminPanel title="期刊指标" subtitle="IF / 分区覆盖">
          <div className="space-y-2 text-sm text-[#6b7c72]">
            <p className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#1a5632]" />
              有 IF{" "}
              <strong className="text-[#122820]">
                {jm.withImpactFactor}/{jm.fileCount}
              </strong>
              （{jm.coveragePct}%）· 任意指标 {jm.withAnyMetrics}
              {" · "}有刊名/ISSN {jm.withIssnOrJournal ?? 0}
            </p>
            {jm.lastImport ? (
              <p className="text-xs text-[#9aa8a0]">
                最近导入：{jm.lastImport.filename} · 更新 {jm.lastImport.updated} 篇 · 命中率{" "}
                {jm.lastImport.matchRate}% ·{" "}
                {new Date(jm.lastImport.at).toLocaleString("zh-CN")}
              </p>
            ) : (
              <p className="text-xs text-[#9aa8a0]">
                尚无导入记录。OpenAlex 不含 JCR IF，需在文献管理上传实验室 CSV/Excel。
              </p>
            )}
            <Link href="/admin/knowledge">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                前往导入期刊指标
              </Button>
            </Link>
          </div>
        </AdminPanel>

        <AdminPanel title="索引文件" span="wide">
          {data.index.indexFiles.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#9aa8a0]">无索引文件</p>
              <Link href="/admin/knowledge">
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  前往文献管理
                </Button>
              </Link>
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {data.index.indexFiles.map((f) => (
                <div
                  key={f}
                  className="flex items-center justify-between rounded-lg border border-[#1a5632]/8 bg-[#faf9f6]/60 px-3 py-2 text-xs text-[#6b7c72]"
                >
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
