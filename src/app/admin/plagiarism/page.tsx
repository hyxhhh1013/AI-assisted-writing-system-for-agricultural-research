"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { AdminPlagiarismDetail, AdminPlagiarismMatchRow } from "@/contracts/admin";
import {
  getAdminPlagiarismDetail,
  listAdminPlagiarism,
  type AdminPlagiarismRecord,
} from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { ADMIN_RISK_BADGE, ADMIN_RISK_LABEL } from "@/lib/admin-labels";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminExpandableList } from "@/components/admin/admin-expandable-list";
import { AdminRecordProjectLinks } from "@/components/admin/admin-record-project-links";

const RISK_OPTIONS = [
  { value: "", label: "全部" },
  { value: "high", label: "高风险" },
  { value: "medium", label: "中风险" },
  { value: "low", label: "低风险" },
];

export default function AdminPlagiarismPage() {
  const [riskFilter, setRiskFilter] = useState("");
  const [detail, setDetail] = useState<AdminPlagiarismDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listFilters = useMemo(
    () => ({ risk: riskFilter || undefined }),
    [riskFilter],
  );

  const { page, setPage, data: checks, meta, loading } = useAdminList({
    fetcher: listAdminPlagiarism,
    filters: listFilters,
  });

  const loadDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getAdminPlagiarismDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const matches: AdminPlagiarismMatchRow[] = detail?.matches ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="查重记录"
        actions={<AdminFilterPills value={riskFilter} options={RISK_OPTIONS} onChange={setRiskFilter} />}
      />

      <AdminExpandableList
        items={checks}
        loading={loading}
        emptyText="暂无查重记录"
        detailLoading={detailLoading}
        loadDetail={loadDetail}
        renderSummary={(c: AdminPlagiarismRecord) => (
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#122820] truncate">{c.title}</p>
              <p className="text-[10px] text-[#9aa8a0] mt-0.5">
                {new Date(c.createdAt).toLocaleString("zh-CN")} · {c.matchCount} 处匹配
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Badge className={ADMIN_RISK_BADGE[c.overallRisk] || ""}>{ADMIN_RISK_LABEL[c.overallRisk] || c.overallRisk}</Badge>
              <span className="text-sm font-bold text-[#122820] tabular-nums">{(c.maxSimilarity * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}
        renderDetail={() => (
          detail ? (
            <div className="space-y-2">
              {matches.length === 0 ? (
                <p className="text-sm text-[#9aa8a0] py-4 text-center">未发现匹配</p>
              ) : (
                matches.map((m, i) => (
                  <div key={i} className="rounded border border-[#1a5632]/10 bg-white px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${ADMIN_RISK_BADGE[m.riskLevel] || ""}`}>
                        {ADMIN_RISK_LABEL[m.riskLevel] || m.riskLevel}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{m.matchType}</Badge>
                      <span className="text-[10px] text-[#9aa8a0]">相似度 {(m.similarity * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-[#6b7c72] line-clamp-2">{m.matchedText}</p>
                    <p className="text-[10px] text-[#9aa8a0] mt-1">来源：{m.matchedFrom}{m.matchedUrl ? ` (${m.matchedUrl})` : ""}</p>
                  </div>
                ))
              )}
            </div>
          ) : null
        )}
        renderFooter={(c) => <AdminRecordProjectLinks projectId={c.projectId} qualityTab="check" />}
      />

      <AdminPagination meta={meta} onPageChange={setPage} />
    </div>
  );
}
