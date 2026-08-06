"use client";

import { useState } from "react";
import { BarChart3, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlotInsertDialog } from "@/components/shared/plot-insert-dialog";
import { chartAssetToPlotHref } from "@/contracts/figure";
import type { ProjectChartAsset } from "@/contracts/figure";

interface RegisteredChartsCardProps {
  projectId: string;
  charts: ProjectChartAsset[];
  /** 无资产时是否仍展示说明卡片 */
  showWhenEmpty?: boolean;
  /** 再次插入成功后通知父级刷新项目（如章节正文） */
  onInserted?: (payload: { projectId: string; sectionKey: string }) => void;
}

export function RegisteredChartsCard({
  projectId,
  charts,
  showWhenEmpty = false,
  onInserted,
}: RegisteredChartsCardProps) {
  const [reinsertAsset, setReinsertAsset] = useState<ProjectChartAsset | null>(null);

  if (charts.length === 0 && !showWhenEmpty) return null;

  const sorted = [...charts].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> 已登记图表
          </CardTitle>
          <CardDescription className="text-xs">
            可将已登记图再次插入到其他章节；「绘图页」用于修改后重新生成（有快照时可回放数据）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              暂无已登记图表。可在「科学绘图」页生成并插入，或让 Agent 调用 generate_chart（会写入本列表）。
            </p>
          ) : (
            sorted.map((asset) => {
              const plotHref = chartAssetToPlotHref(projectId, asset);
              const hasReplay = Boolean(asset.figureSpecEnc);
              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 rounded-md border border-[#1a5632]/10 bg-muted/20 p-2 text-[10px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover bg-white"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={asset.caption}>
                      {asset.caption}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {asset.figureId}
                      {asset.sectionKey ? ` · ${asset.sectionKey}` : ""}
                      {hasReplay ? " · 可回放" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setReinsertAsset(asset)}
                    >
                      <FilePlus2 className="mr-0.5 h-3 w-3" />
                      插入
                    </Button>
                    <a
                      href={plotHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-center text-primary hover:underline"
                    >
                      绘图页
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {reinsertAsset && (
        <PlotInsertDialog
          open={Boolean(reinsertAsset)}
          onOpenChange={(open) => {
            if (!open) setReinsertAsset(null);
          }}
          imageUrl={reinsertAsset.imageUrl}
          caption={reinsertAsset.caption}
          defaultProjectId={projectId}
          figureId={reinsertAsset.figureId}
          svgUrl={reinsertAsset.svgUrl}
          pdfUrl={reinsertAsset.pdfUrl}
          figureSpecEnc={reinsertAsset.figureSpecEnc}
          registerAsset={false}
          onSuccess={(payload) => {
            onInserted?.(payload);
          }}
        />
      )}
    </>
  );
}
