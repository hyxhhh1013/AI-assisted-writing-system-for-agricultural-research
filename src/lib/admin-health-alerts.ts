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
    const eligible = jm.withIssnOrJournal ?? 0;
    if (!jm.lastImport) {
      alerts.push({
        message: `尚未导入实验室期刊 IF 表（覆盖 ${jm.coveragePct}%；有刊名/ISSN ${eligible} 篇）`,
        href: "/admin/knowledge",
        label: "导入指标",
      });
    } else {
      alerts.push({
        message: `期刊 IF 覆盖仅 ${jm.coveragePct}%（${jm.withImpactFactor}/${jm.fileCount}，可匹配 ${eligible} 篇）`,
        href: "/admin/knowledge",
        label: "导入指标",
      });
    }
  }

  const agent = health.agent;
  if (agent && agent.errorSessions24h >= 3) {
    alerts.push({
      message: `近 24h 有 ${agent.errorSessions24h} 个 Agent 会话出错`,
      href: "/admin/agent-sessions?status=error",
      label: "查看会话",
    });
  }

  const server = health.server;
  if (typeof server.heapPct === "number" && server.heapPct >= 85) {
    const cap = server.heapLimitMB ?? server.heapTotalMB;
    alerts.push({
      message: `Node heap ${server.heapPct}%（${server.heapUsedMB}/${cap} MB 上限）`,
      href: "/admin/health",
      label: "看健康",
    });
  }
  const rssMB = typeof server.memoryMB === "number" ? server.memoryMB : 0;
  const rssCap =
    server.pm2?.maxMemoryMB && server.pm2.maxMemoryMB > 0
      ? server.pm2.maxMemoryMB
      : null;
  if (rssCap && rssMB >= Math.round(rssCap * 0.85)) {
    alerts.push({
      message: `进程 RSS ${rssMB} MB，接近 PM2 上限 ${rssCap} MB`,
      href: "/admin/health",
      label: "看健康",
    });
  }
  if (server.chromiumAvailable === false) {
    alerts.push({
      message: "未检测到 Chromium，PDF 导出可能失败",
      href: "/admin/health",
      label: "看健康",
    });
  }
  const pm2 = server.pm2;
  if (pm2) {
    if (pm2.status !== "online") {
      alerts.push({
        message: `PM2 ${pm2.name} 状态 ${pm2.status}`,
        href: "/admin/health",
        label: "看健康",
      });
    } else if ((pm2.unstableRestarts ?? 0) >= 3) {
      alerts.push({
        message: `PM2 ${pm2.name} 短时反复重启 ${pm2.unstableRestarts} 次`,
        href: "/admin/health",
        label: "看健康",
      });
    }
  }

  return alerts;
}
