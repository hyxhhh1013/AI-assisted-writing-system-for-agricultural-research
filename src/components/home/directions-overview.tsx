"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Compass,
  FlaskConical,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DirectionSummary {
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  assetCount: number;
  analysisDone: boolean;
  analysisScore: number | null;
  paperCounts: { total: number; planned: number; writing: number; submitted: number; published: number };
  readyCount: number;
  updatedAt: number;
}

export function DirectionsOverview() {
  const [items, setItems] = useState<DirectionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/directions/summary")
      .then((r) => r.json())
      .then((data) => setItems((data as { items: DirectionSummary[] }).items || []))
      .catch(() => { /* 静默降级 */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <section className="mb-12">
      {/* 标题栏 */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-[#1a5632]" />
          <h2 className="text-sm font-semibold tracking-wide text-[#122820]">研究方向</h2>
          <span className="text-xs text-[#9aa8a0]">{items.length} 个方向</span>
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((d) => (
          <Link
            key={d.slug}
            href={`/directions/${d.slug}`}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-xl border transition-all",
              "border-[#1a5632]/10 bg-white hover:border-[#1a5632]/25 hover:shadow-[0_6px_24px_-10px_rgba(26,86,50,0.18)]",
            )}
          >
            {/* 顶部色条 */}
            <div className="h-1 w-full bg-gradient-to-r from-[#1a5632] to-[#1a5632]/40" />

            <div className="flex flex-1 flex-col p-4">
              {/* 名称 */}
              <div className="mb-3 flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1a5632]/8 text-[#1a5632]">
                  <Compass className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#122820] line-clamp-1">{d.name}</h3>
                  <p className="text-[10px] text-[#9aa8a0] line-clamp-1">
                    {d.categories.slice(0, 2).join(" · ")}
                  </p>
                </div>
              </div>

              {/* 状态行 */}
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#6b7c72]">
                  <FlaskConical className="h-3 w-3 text-[#2563eb]/70" />
                  <span>{d.assetCount} 项资产</span>
                  {d.analysisDone && d.analysisScore != null && (
                    <>
                      <span className="text-[#1a5632]/20">|</span>
                      <BarChart3 className="h-3 w-3 text-[#1a5632]/70" />
                      <span className="font-medium text-[#1a5632]">{d.analysisScore}/10</span>
                    </>
                  )}
                </div>
              </div>

              {/* 论文进度条 */}
              {d.paperCounts.total > 0 ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-[#9aa8a0]">
                    <span>
                      {d.paperCounts.writing + d.paperCounts.submitted + d.paperCounts.published}
                      /{d.paperCounts.total} 进行中
                    </span>
                    {d.readyCount > 0 && (
                      <span className="font-medium text-[#1a5632]">{d.readyCount} 篇可启动</span>
                    )}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[#1a5632]/6">
                    <div className="flex h-full">
                      {d.paperCounts.published > 0 && (
                        <div
                          className="bg-[#6366f1]"
                          style={{ width: `${(d.paperCounts.published / d.paperCounts.total) * 100}%` }}
                        />
                      )}
                      {d.paperCounts.submitted > 0 && (
                        <div
                          className="bg-[#2563eb]"
                          style={{ width: `${(d.paperCounts.submitted / d.paperCounts.total) * 100}%` }}
                        />
                      )}
                      {d.paperCounts.writing > 0 && (
                        <div
                          className="bg-[#b8975a]"
                          style={{ width: `${(d.paperCounts.writing / d.paperCounts.total) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : d.analysisDone ? (
                <p className="text-[10px] text-[#9aa8a0]">分析完成，待生成路线图</p>
              ) : d.assetCount >= 3 ? (
                <p className="text-[10px] text-[#b8975a]">可启动分析</p>
              ) : (
                <p className="text-[10px] text-[#9aa8a0]">资产不足（需 ≥3）</p>
              )}
            </div>
          </Link>
        ))}

      </div>
    </section>
  );
}
