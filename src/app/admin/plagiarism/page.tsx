"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Check {
  id: string; projectId: string; title: string; status: string; maxSimilarity: number; overallRisk: string; matchCount: number; createdAt: string;
}

const RISK_BADGE: Record<string, string> = { high: "bg-red-50 text-red-700", medium: "bg-amber-50 text-amber-700", low: "bg-green-50 text-green-700" };
const RISK_LABEL: Record<string, string> = { high: "高风险", medium: "中风险", low: "低风险" };

export default function AdminPlagiarismPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState("");

  useEffect(() => {
    fetch(`/api/admin/plagiarism${riskFilter ? `?risk=${riskFilter}` : ""}`)
      .then(r => r.json()).then(d => { setChecks(d.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, [riskFilter]);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id); setDetail(null); setDetailLoading(true);
    try {
      const r = await fetch(`/api/admin/plagiarism/${id}`);
      const d = await r.json();
      if (d.success) setDetail(d.data);
    } catch { } finally { setDetailLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;

  const matches = (detail as any)?.matches || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#122820]">查重记录</h2>
        <div className="flex gap-1">{[ "", "high", "medium", "low" ].map(r => <Button key={r} variant={riskFilter === r ? "default" : "ghost"} size="sm" className="h-8 text-[10px]" onClick={() => setRiskFilter(r)}>{r ? RISK_LABEL[r] || r : "全部"}</Button>)}</div>
      </div>
      {checks.length === 0 ? <p className="py-12 text-center text-[#9aa8a0] text-sm">暂无查重记录</p> : (
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.id}>
              <button onClick={() => toggle(c.id)} className="w-full text-left rounded-xl border border-[#1a5632]/10 bg-white p-4 hover:border-[#1a5632]/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#122820] truncate">{c.title}</p>
                    <p className="text-[10px] text-[#9aa8a0] mt-0.5">{new Date(c.createdAt).toLocaleString("zh-CN")} · {c.matchCount} 处匹配</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <Badge className={RISK_BADGE[c.overallRisk] || ""}>{RISK_LABEL[c.overallRisk] || c.overallRisk}</Badge>
                    <span className="text-sm font-bold text-[#122820] tabular-nums">{(c.maxSimilarity * 100).toFixed(0)}%</span>
                    {expanded === c.id ? <ChevronUp className="h-4 w-4 text-[#1a5632]/50" /> : <ChevronDown className="h-4 w-4 text-[#1a5632]/30" />}
                  </div>
                </div>
              </button>
              {expanded === c.id && (
                <div className="border-x border-b border-[#1a5632]/20 rounded-b-xl bg-[#faf9f6] p-4">
                  {detailLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : detail ? (
                    <div className="space-y-2">
                      {matches.length === 0 ? <p className="text-sm text-[#9aa8a0] py-4 text-center">未发现匹配</p> :
                        matches.map((m: any, i: number) => (
                          <div key={i} className="rounded border border-[#1a5632]/10 bg-white px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={`text-[10px] ${RISK_BADGE[m.riskLevel] || ""}`}>{RISK_LABEL[m.riskLevel] || m.riskLevel}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{m.matchType}</Badge>
                              <span className="text-[10px] text-[#9aa8a0]">相似度 {(m.similarity * 100).toFixed(0)}%</span>
                            </div>
                            <p className="text-[#6b7c72] line-clamp-2">{m.matchedText}</p>
                            <p className="text-[10px] text-[#9aa8a0] mt-1">来源：{m.matchedFrom}{m.matchedUrl ? ` (${m.matchedUrl})` : ""}</p>
                          </div>
                        ))
                      }
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
