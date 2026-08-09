import type { AdminHealthData } from "@/contracts/admin";

export interface AdminHealthAlert {
  message: string;
  href: string;
  label: string;
}

/** 仪表盘与 Health 页共用告警规则（ADMIN-031 / ADMIN-042） */
export function buildAdminHealthAlerts(health: AdminHealthData): AdminHealthAlert[] {
  const alerts: AdminHealthAlert[] = [];

  if (!health.db.connected) {
    alerts.push({ message: "数据库连接异常", href: "/admin/settings", label: "检查配置" });
  }

  for (const name of health.ai?.missingKeyProviders ?? []) {
    alerts.push({
      message: `${name} 未配置 API Key`,
      href: "/admin/settings",
      label: "去配置",
    });
  }

  if (health.knowledge.uncategorizedCount > 0) {
    alerts.push({
      message: `${health.knowledge.uncategorizedCount} 篇文献未分类`,
      href: "/admin/knowledge?category=未分类",
      label: "去整理",
    });
  }

  if (health.index.indexFiles.length === 0) {
    alerts.push({ message: "RAG 索引文件缺失", href: "/admin/knowledge", label: "重建索引" });
  }

  const k = health.knowledge;
  if ((k.pdfMissingInSample ?? 0) > 0) {
    alerts.push({
      message: `抽样中 ${k.pdfMissingInSample} 篇 PDF 磁盘缺失`,
      href: "/admin/knowledge",
      label: "查看文献",
    });
  }
  if ((k.categoryDriftInSample ?? 0) > 0) {
    alerts.push({
      message: `抽样中 ${k.categoryDriftInSample} 篇分类与磁盘路径不一致`,
      href: "/admin/knowledge",
      label: "去核对",
    });
  }

  const jm = health.journalMetrics;
  if (jm && jm.fileCount >= 10 && jm.coveragePct < 20) {
    alerts.push({
      message: `期刊 IF 覆盖仅 ${jm.coveragePct}%（${jm.withImpactFactor}/${jm.fileCount}）`,
      href: "/admin/knowledge",
      label: "导入指标",
    });
  }

  const agent = health.agent;
  if (agent && agent.errorSessions24h >= 3) {
    alerts.push({
      message: `近 24h 有 ${agent.errorSessions24h} 个 Agent 会话出错`,
      href: "/admin/agent-sessions?status=error",
      label: "查看会话",
    });
  }

  return alerts;
}
