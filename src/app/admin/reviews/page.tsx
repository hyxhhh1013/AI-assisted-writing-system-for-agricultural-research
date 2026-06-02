"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  getAdminReviewDetail,
  listAdminReviews,
  type AdminReviewDetail,
  type AdminReviewRecord,
} from "@/services/admin";

const GRADE_COLOR: Record<string, string> = { A: "bg-green-50 text-green-700", B: "bg-blue-50 text-blue-700", C: "bg-amber-50 text-amber-700", D: "bg-red-50 text-red-700" };
const DIM_LABEL: Record<string, string> = { academic: "学术规范", argument: "论证质量", structure: "结构规范", integrity: "学术诚信" };

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [gradeFilter, setGradeFilter] = useState("");

  useEffect(() => {
    listAdminReviews(gradeFilter || undefined)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gradeFilter]);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id); setDetail(null); setDetailLoading(true);
    try {
      setDetail(await getAdminReviewDetail(id));
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;

  const grouped = detail ? detail.issues.reduce<Record<string, typeof detail.issues>>((a, i) => { (a[i.dimension] ??= []).push(i); return a; }, {}) : {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#122820]">审查记录</h2>
        <div className="flex gap-1">{[ "", "A", "B", "C", "D" ].map(g => <Button key={g} variant={gradeFilter === g ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setGradeFilter(g)}>{g || "全部"}</Button>)}</div>
      </div>
      {reviews.length === 0 ? <p className="py-12 text-center text-[#9aa8a0] text-sm">暂无审查记录</p> : (
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.id}>
              <button onClick={() => toggle(r.id)} className="w-full text-left rounded-xl border border-[#1a5632]/10 bg-white p-4 hover:border-[#1a5632]/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#122820] truncate">{r.title}</p>
                    <p className="text-[10px] text-[#9aa8a0] mt-0.5">{new Date(r.createdAt).toLocaleString("zh-CN")} · {r.issueCount} 个问题</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {r.overallGrade && <Badge className={GRADE_COLOR[r.overallGrade] || ""}>{r.overallGrade}级</Badge>}
                    <span className="text-sm font-bold text-[#122820] tabular-nums">{r.overallScore}分</span>
                    {expanded === r.id ? <ChevronUp className="h-4 w-4 text-[#1a5632]/50" /> : <ChevronDown className="h-4 w-4 text-[#1a5632]/30" />}
                  </div>
                </div>
              </button>
              {expanded === r.id && (
                <div className="border-x border-b border-[#1a5632]/20 rounded-b-xl bg-[#faf9f6] p-4">
                  {detailLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : detail ? (
                    <div className="space-y-3">
                      {Object.entries(grouped).map(([dim, issues]) => (
                        <div key={dim}>
                          <p className="text-[10px] font-semibold uppercase text-[#1a5632]/60">{DIM_LABEL[dim] || dim} ({issues.length})</p>
                          <div className="mt-1 space-y-1.5">
                            {issues.map((issue, i) => (
                              <div key={i} className="rounded border border-[#1a5632]/10 bg-white px-3 py-2 text-xs">
                                <div className="flex gap-2 mb-1">
                                  <Badge variant="outline" className={`text-[10px] ${issue.severity === "high" ? "text-red-600" : issue.severity === "medium" ? "text-amber-600" : "text-green-600"}`}>{issue.severity}</Badge>
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
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
