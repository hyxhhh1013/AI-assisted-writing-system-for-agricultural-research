"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Ban } from "lucide-react";
import {
  getAdminAgentSessionDetail,
  interruptAdminAgentSession,
  listAdminAgentSessions,
  type AdminAgentSessionDetail,
} from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminExpandableList } from "@/components/admin/admin-expandable-list";

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "interrupted", label: "已中断" },
  { value: "completed", label: "已完成" },
  { value: "error", label: "出错" },
];

const STATUS_COLOR: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  interrupted: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export default function AdminAgentSessionsPage() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [detail, setDetail] = useState<AdminAgentSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interrupting, setInterrupting] = useState<string | null>(null);

  const { setPage, data: sessions, meta, loading, reload } = useAdminList({
    fetcher: listAdminAgentSessions,
    filters: { status: statusFilter || undefined },
    urlSync: true,
  });

  const loadDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getAdminAgentSessionDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const doInterrupt = async (id: string) => {
    setInterrupting(id);
    try {
      const r = await interruptAdminAgentSession(id);
      if (r.ok) {
        toast.success("已强制中断");
        setDetail(null);
        await reload();
      } else {
        toast.error(r.error || "中断失败");
      }
    } catch {
      toast.error("中断失败");
    } finally {
      setInterrupting(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Agent 会话监控"
        actions={
          <AdminFilterPills value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        }
      />

      <AdminExpandableList
        items={sessions}
        loading={loading}
        emptyText="暂无 Agent 会话"
        detailLoading={detailLoading}
        loadDetail={loadDetail}
        renderSummary={(s) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#122820]">{s.goal}</p>
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">
                {s.userName ?? s.userId.slice(0, 8)}
                {s.projectTitle ? ` · ${s.projectTitle}` : ""}
                {s.directionSlug ? ` · 方向 ${s.directionSlug}` : ""}
                {" · "}
                {new Date(s.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <Badge className={`shrink-0 ${STATUS_COLOR[s.status] || ""}`}>{s.status}</Badge>
          </div>
        )}
        renderDetail={() =>
          detail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">迭代 <b>{detail.iteration}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">工具调用 <b>{detail.toolCallCount}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">状态 <b>{detail.status}</b></div>
                <div className="rounded border border-[#1a5632]/10 bg-white p-2">用户 <b>{detail.userName ?? detail.userId.slice(0, 8)}</b></div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#1a5632]/60">目标</p>
                <p className="rounded border border-[#1a5632]/10 bg-white p-2 text-xs text-[#3d4f46]">{detail.goal}</p>
              </div>
              {detail.errorMessage && (
                <div>
                  <p className="text-[10px] font-semibold text-red-600">错误信息</p>
                  <p className="whitespace-pre-wrap rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                    {detail.errorMessage}
                  </p>
                </div>
              )}
              {detail.status === "running" && (
                <Button
                  size="sm" variant="destructive" className="gap-1"
                  disabled={interrupting === detail.id}
                  onClick={() => void doInterrupt(detail.id)}
                >
                  {interrupting === detail.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  强制中断
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <AdminPagination meta={meta} onPageChange={setPage} />
    </div>
  );
}
