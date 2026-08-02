"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import {
  listAdminDirections,
  setAdminDirectionStatus,
  type AdminDirectionRecord,
} from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminExpandableList } from "@/components/admin/admin-expandable-list";

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "active", label: "启用" },
  { value: "archived", label: "已归档" },
];

function formatTs(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("zh-CN");
}

export default function AdminDirectionsPage() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [toggling, setToggling] = useState<string | null>(null);

  const { setPage, data: directions, meta, loading, reload } = useAdminList({
    fetcher: listAdminDirections,
    filters: { status: statusFilter || undefined },
    urlSync: true,
  });

  const toggle = async (d: AdminDirectionRecord) => {
    setToggling(d.id);
    try {
      const next = d.status === "active" ? "archived" : "active";
      const r = await setAdminDirectionStatus(d.id, next);
      if (r.ok) {
        toast.success(next === "active" ? "已启用" : "已归档");
        await reload();
      } else {
        toast.error(r.error || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setToggling(null);
    }
  };

  const Metric = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-center">
      <div className="text-sm font-bold text-[#122820] tabular-nums">{value}</div>
      <div className="text-[9px] text-[#9aa8a0]">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="研究方向管理"
        actions={
          <AdminFilterPills value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        }
      />

      <AdminExpandableList
        items={directions}
        loading={loading}
        emptyText="暂无研究方向"
        detailLoading={false}
        loadDetail={async () => {}}
        renderSummary={(d) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#122820]">{d.name}</p>
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">
                {d.slug} · {d.userName ?? d.userId.slice(0, 8)}
                {" · "}
                {new Date(d.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <Badge
              className={`shrink-0 ${
                d.status === "active" ? "bg-green-100 text-green-700" : "bg-[#e8e4dc] text-[#6b7c72]"
              }`}
            >
              {d.status === "active" ? "启用" : "已归档"}
            </Badge>
          </div>
        )}
        renderDetail={(d) => (
          <div className="space-y-3">
            {d.description && (
              <p className="line-clamp-3 text-xs text-[#3d4f46]">{d.description}</p>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Metric label="资产" value={d.assetCount} />
              <Metric label="文献" value={d.literatureCount} />
              <Metric label="核心文献" value={d.coreLiteratureCount} />
              <Metric label="路线图论文" value={d.roadmapPapers} />
              <Metric label="路线图确认" value={d.roadmapConfirmed ? "✓" : "—"} />
              <Metric label="分析日期" value={formatTs(d.analysisAt)} />
            </div>
          </div>
        )}
        renderFooter={(d) => (
          <div className="mt-3">
            <Button
              size="sm" variant={d.status === "active" ? "outline" : "default"} className="gap-1"
              disabled={toggling === d.id}
              onClick={() => void toggle(d)}
            >
              {toggling === d.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : d.status === "active" ? (
                <Archive className="h-3.5 w-3.5" />
              ) : (
                <ArchiveRestore className="h-3.5 w-3.5" />
              )}
              {d.status === "active" ? "归档" : "启用"}
            </Button>
          </div>
        )}
      />

      <AdminPagination meta={meta} onPageChange={setPage} />
    </div>
  );
}
