"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  getAdminReviewDetail,
  listAdminReviews,
  type AdminReviewDetail,
  type AdminReviewRecord,
} from "@/services/admin";
import { useAdminList } from "@/hooks/use-admin-list";
import { ADMIN_GRADE_COLOR, ADMIN_REVIEW_DIM_LABEL } from "@/lib/admin-labels";
import { AdminPageHeader, AdminFilterPills } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminExpandableList } from "@/components/admin/admin-expandable-list";
import { AdminRecordProjectLinks } from "@/components/admin/admin-record-project-links";

const GRADE_OPTIONS = [
  { value: "", label: "全部" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
];

export default function AdminReviewsPage() {
  const [gradeFilter, setGradeFilter] = useState("");
  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listFilters = useMemo(
    () => ({ grade: gradeFilter || undefined }),
    [gradeFilter],
  );

  const { page, setPage, data: reviews, meta, loading } = useAdminList({
    fetcher: listAdminReviews,
    filters: listFilters,
  });

  const loadDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getAdminReviewDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const grouped = detail
    ? detail.issues.reduce<Record<string, typeof detail.issues>>((acc, issue) => {
        (acc[issue.dimension] ??= []).push(issue);
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="审查记录"
        actions={<AdminFilterPills value={gradeFilter} options={GRADE_OPTIONS} onChange={setGradeFilter} />}
      />

      <AdminExpandableList
        items={reviews}
        loading={loading}
        emptyText="暂无审查记录"
        detailLoading={detailLoading}
        loadDetail={loadDetail}
        renderSummary={(r: AdminReviewRecord) => (
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#122820] truncate">{r.title}</p>
              <p className="text-[10px] text-[#9aa8a0] mt-0.5">
                {new Date(r.createdAt).toLocaleString("zh-CN")} · {r.issueCount} 个问题
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {r.overallGrade && <Badge className={ADMIN_GRADE_COLOR[r.overallGrade] || ""}>{r.overallGrade}级</Badge>}
              <span className="text-sm font-bold text-[#122820] tabular-nums">{r.overallScore}分</span>
            </div>
          </div>
        )}
        renderDetail={() => (
          detail ? (
            <div className="space-y-3">
              {Object.entries(grouped).map(([dim, issues]) => (
                <div key={dim}>
                  <p className="text-[10px] font-semibold uppercase text-[#1a5632]/60">
                    {ADMIN_REVIEW_DIM_LABEL[dim] || dim} ({issues.length})
                  </p>
                  <div className="mt-1 space-y-1.5">
                    {issues.map((issue, i) => (
                      <div key={i} className="rounded border border-[#1a5632]/10 bg-white px-3 py-2 text-xs">
                        <div className="flex gap-2 mb-1">
                          <Badge variant="outline" className={`text-[10px] ${issue.severity === "high" ? "text-red-600" : issue.severity === "medium" ? "text-amber-600" : "text-green-600"}`}>
                            {issue.severity}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">{issue.type}</Badge>
                        </div>
                        <p className="text-[#3d4f46]">{issue.description}</p>
                        {issue.suggestion && <p className="mt-1 text-[#1a5632] text-[10px]">💡 {issue.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null
        )}
        renderFooter={(r) => <AdminRecordProjectLinks projectId={r.projectId} qualityTab="review" />}
      />

      <AdminPagination meta={meta} onPageChange={setPage} />
    </div>
  );
}
