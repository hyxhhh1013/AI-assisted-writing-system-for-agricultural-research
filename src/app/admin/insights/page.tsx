"use client";

import { useEffect, useState } from "react";
import { Loader2, Bot, AlertTriangle, Target, Wrench } from "lucide-react";
import { toast } from "sonner";
import { getAdminInsights, type AdminInsights } from "@/services/admin";
import { adminToolLabel } from "@/lib/admin-labels";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminMetricStrip } from "@/components/admin/admin-stat-card";
import { AdminPanel, AdminCompactList } from "@/components/admin/admin-panel";
import { AdminHBarChart } from "@/components/admin/admin-bar-chart";

export default function AdminInsightsPage() {
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminInsights()
      .then(setInsights)
      .catch(() => toast.error("加载使用洞察失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
      </div>
    );
  }
  if (!insights) {
    return <div className="py-20 text-center text-sm text-[#6b7c72]">加载失败</div>;
  }

  const intentItems = insights.goalIntents.map((g) => ({ label: g.intent, value: g.count }));
  const toolItems = insights.toolCalls.map((t) => ({
    label: adminToolLabel(t.tool),
    value: t.count,
    hint: "调用",
  }));
  const errorTotal = Math.max(insights.errorSessionCount, 1);
  const errorItems = insights.errorPatterns.map((p) => ({
    label: p.pattern,
    value: p.count,
    hint: `${Math.round((p.count / errorTotal) * 100)}%`,
  }));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="使用洞察"
        subtitle="从用户会话聚合高频信号，支撑针对性优化"
      />

      <AdminMetricStrip
        items={[
          { label: "总会话", value: insights.totalSessions, icon: Bot },
          { label: "错误会话", value: insights.errorSessionCount, icon: AlertTriangle },
          { label: "高频意图词", value: insights.goalIntents.length, icon: Target },
          { label: "使用过的工具", value: insights.toolCalls.length, icon: Wrench },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="用户目标高频" subtitle="会话目标里的任务意图词（Top 12）">
          {intentItems.length > 0 ? (
            <AdminHBarChart items={intentItems} maxItems={12} />
          ) : (
            <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无会话</p>
          )}
        </AdminPanel>

        <AdminPanel title="工具调用榜" subtitle="Agent 最常使用的工具（Top 12）">
          {toolItems.length > 0 ? (
            <AdminCompactList items={toolItems} />
          ) : (
            <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无工具调用</p>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="失败模式排行" subtitle="出错会话的错误聚类">
        {errorItems.length > 0 ? (
          <AdminCompactList items={errorItems} />
        ) : (
          <p className="py-8 text-center text-xs text-[#9aa8a0]">暂无失败记录</p>
        )}
      </AdminPanel>
    </div>
  );
}
