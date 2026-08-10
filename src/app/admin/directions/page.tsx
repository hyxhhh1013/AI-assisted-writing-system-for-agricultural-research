"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import {
  getAdminDirectionDetail,
  listAdminDirections,
  setAdminDirectionStatus,
  type AdminDirectionDetail,
  type AdminDirectionRecord,
} from "@/services/admin";
import type { DirectionAsset } from "@/contracts/direction";
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

function AssetItem({ asset }: { asset: DirectionAsset }) {
  switch (asset.kind) {
    case "experiment":
      return (
        <li className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs text-[#3d4f46]">
          🧪 <span className="font-medium text-[#122820]">{asset.title}</span>
          <span className="ml-1 text-[9px] text-[#9aa8a0]">实验 · {asset.dateRange}</span>
        </li>
      );
    case "paper":
      return (
        <li className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs text-[#3d4f46]">
          📄 <span className="font-medium text-[#122820]">{asset.title}</span>
          <span className="ml-1 text-[9px] text-[#9aa8a0]">论文 · {asset.journal} {asset.year}</span>
        </li>
      );
    case "dataset":
      return (
        <li className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs text-[#3d4f46]">
          📊 <span className="font-medium text-[#122820]">{asset.title}</span>
          <span className="ml-1 text-[9px] text-[#9aa8a0]">数据集{asset.filePath ? ` · ${asset.filePath}` : ""}</span>
        </li>
      );
  }
}

const ROADMAP_STATUS_LABEL: Record<string, string> = {
  planned: "计划中",
  writing: "撰写中",
  submitted: "已投稿",
  published: "已发表",
};

export default function AdminDirectionsPage() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [toggling, setToggling] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDirectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { setPage, data: directions, meta, loading, reload } = useAdminList({
    fetcher: listAdminDirections,
    filters: { status: statusFilter || undefined },
    urlSync: true,
  });

  const loadDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getAdminDirectionDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

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

  const paperTitle = (candidateId: string) =>
    detail?.analysis?.paperCandidates.find((p) => p.id === candidateId)?.title;

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
        detailLoading={detailLoading}
        loadDetail={loadDetail}
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
        renderDetail={() =>
          detail ? (
            <div className="space-y-4">
              {detail.description && (
                <p className="text-xs text-[#3d4f46]">{detail.description}</p>
              )}
              {detail.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.categories.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Metric label="资产" value={detail.assets.length} />
                <Metric label="文献" value={detail.literatureEntries.length} />
                <Metric label="核心文献" value={detail.literatureEntries.filter((e) => e.role === "core").length} />
                <Metric label="路线图论文" value={detail.roadmap?.papers.length ?? 0} />
                <Metric label="路线图确认" value={detail.roadmap?.confirmedAt ? "✓" : "—"} />
                <Metric label="分析日期" value={formatTs(detail.analysis?.generatedAt ?? null)} />
              </div>

              {/* 资产 */}
              {detail.assets.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">
                    资产（{detail.assets.length}）
                  </p>
                  <ul className="space-y-1">
                    {detail.assets.slice(0, 12).map((a) => <AssetItem key={a.id} asset={a} />)}
                    {detail.assets.length > 12 && (
                      <li className="text-[10px] text-[#9aa8a0]">… 还有 {detail.assets.length - 12} 项</li>
                    )}
                  </ul>
                </div>
              )}

              {/* 文献语料 */}
              {detail.literatureEntries.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">
                    文献语料（{detail.literatureEntries.length}）
                    {detail.literatureConfirmedAt ? " · 已确认" : ""}
                  </p>
                  <ul className="space-y-1">
                    {detail.literatureEntries.slice(0, 10).map((e) => (
                      <li key={e.id} className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs text-[#3d4f46]">
                        <span className={`mr-1 ${e.role === "core" ? "font-medium text-[#1a5632]" : "text-[#9aa8a0]"}`}>
                          {e.role === "core" ? "★" : "·"}
                        </span>
                        {e.title}
                      </li>
                    ))}
                    {detail.literatureEntries.length > 10 && (
                      <li className="text-[10px] text-[#9aa8a0]">… 还有 {detail.literatureEntries.length - 10} 条</li>
                    )}
                  </ul>
                </div>
              )}

              {/* 路线图 */}
              {detail.roadmap && detail.roadmap.papers.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">
                    路线图论文（{detail.roadmap.papers.length}）
                    {detail.roadmap.confirmedAt ? " · 已确认" : ""}
                  </p>
                  <div className="space-y-1">
                    {detail.roadmap.papers.slice(0, 8).map((p) => (
                      <div key={p.candidateId} className="flex items-center gap-2 rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-xs">
                        <Badge variant="outline" className="text-[9px] text-[#6b7c72]">
                          {ROADMAP_STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                        <span className="truncate text-[#3d4f46]">
                          {paperTitle(p.candidateId) ?? `候选 ${p.candidateId.slice(0, 8)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 分析概览 */}
              {detail.analysis && detail.analysis.dimensions.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-[#1a5632]/60">分析概览</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {detail.analysis.dimensions.map((dim) => (
                        <div key={dim.id} className="rounded border border-[#1a5632]/10 bg-white px-2 py-1.5 text-center">
                          <div className="truncate text-xs font-medium text-[#122820]">{dim.name}</div>
                          <div className="text-[9px] text-[#9aa8a0]">
                            {dim.score?.toFixed(1)} · {dim.confidence}
                          </div>
                        </div>
                      ))}
                    </div>
                    {detail.analysis.paperCandidates.length > 0 && (
                      <div>
                        <p className="mb-1 text-[9px] text-[#9aa8a0]">论文候选</p>
                        <ul className="space-y-1">
                          {detail.analysis.paperCandidates.slice(0, 6).map((c) => (
                            <li key={c.id} className="text-xs text-[#3d4f46]">
                              • {c.title} <span className="text-[#1a5632]">[{c.tier}]</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null
        }
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
