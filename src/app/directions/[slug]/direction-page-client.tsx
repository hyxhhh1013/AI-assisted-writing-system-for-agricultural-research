"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { DirectionStatCards } from "@/components/shared/direction/direction-stat-cards";
import { DirectionAssetForm } from "@/components/shared/direction/direction-asset-form";
import { DirectionAssetScanDialog } from "@/components/shared/direction/direction-asset-scan-dialog";
import { DirectionAssetList } from "@/components/shared/direction/direction-asset-list";
import { DirectionAnalysisPanel } from "@/components/shared/direction/direction-analysis-panel";
import { DirectionRoadmapTimeline } from "@/components/shared/direction/direction-roadmap-timeline";
import { DirectionDashboard } from "@/components/shared/direction/direction-dashboard";
import { DirectionSocraticDialog } from "@/components/shared/direction/direction-socratic-dialog";
import {
  Compass,
  PackageOpen,
  ClipboardCheck,
  BarChart3,
  Map,
  ArrowRight,
  Plus,
  Search,
} from "lucide-react";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getDirection,
  patchAssets,
} from "@/services/direction";
import type { DirectionDTO, DirectionAsset, PaperCandidate, SynthesisResult } from "@/contracts/direction";

const TABS = [
  { id: "assets", label: "资产盘点", icon: PackageOpen, phase: 0 },
  { id: "contract", label: "预承诺", icon: ClipboardCheck, phase: 1 },
  { id: "analysis", label: "8 维度分析", icon: BarChart3, phase: 2 },
  { id: "roadmap", label: "论文路线图", icon: Map, phase: 3 },
] as const;

export default function DirectionPageClient() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [direction, setDirection] = useState<DirectionDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assets");

  // Phase 0: 方向配置编辑状态
  // Phase 0: 资产编辑状态
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editAsset, setEditAsset] = useState<DirectionAsset | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const fetchDirection = useCallback(async () => {
    setIsLoading(true);
    try {
      const dto = await getDirection(slug);
      setDirection(dto);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取方向失败");
      router.push("/directions");
    } finally {
      setIsLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    void fetchDirection();
  }, [fetchDirection]);

  // ====== Phase 0: 资产管理 ======

  const assets: DirectionAsset[] = Array.isArray(direction?.assets)
    ? (direction.assets as DirectionAsset[])
    : [];

  const handleAssetSave = async (asset: DirectionAsset) => {
    if (!direction) return;
    try {
      const updated = await patchAssets(slug, [
        { op: "upsert", asset },
      ]);
      setDirection(updated);
      setShowAssetForm(false);
      setEditAsset(null);
      toast.success(editAsset ? "资产已更新" : "资产已添加");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存资产失败");
    }
  };

  const handleAssetDelete = async (assetId: string) => {
    if (!direction) return;
    try {
      const updated = await patchAssets(slug, [
        { op: "delete", assetId },
      ]);
      setDirection(updated);
      toast.success("资产已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除资产失败");
    }
  };

  const handleScanImport = async (imported: DirectionAsset[]) => {
    if (!direction) return;
    try {
      const updated = await patchAssets(
        slug,
        imported.map((asset) => ({ op: "upsert", asset })),
      );
      setDirection(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入资产失败");
    }
  };

  // ====== Phase 2: 预承诺（Socratic Mentor）======

  const analysis = (direction?.analysis as Record<string, unknown> | null) || {};
  const existingContract = analysis.evaluationContract as
    | { dimensions?: Array<{ id: string; rubrics?: Array<{ id: string; what_to_look_for: string }> }>; confirmedAt?: number }
    | undefined;
  const hasContract = !!existingContract?.confirmedAt;

  const handleRefreshDirection = async () => {
    await fetchDirection();
  };

  // ====== Knowledge base literature count (来自 API) ======

  const literatureCount = direction?.literatureCount ?? 0;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-[#6b7c72]">
        正在加载方向数据…
      </div>
    );
  }

  if (!direction) return null;

  return (
    <>
      <PageHeader
        title={direction.name}
        subtitle={direction.description?.slice(0, 120) || "方向战略规划工作台"}
        icon={Compass}
        backHref="/"
        backForceFallback
      />

      {/* 统计卡片 */}
      <div className="mb-6">
        <DirectionStatCards assets={assets} literatureCount={literatureCount} />
      </div>

      {/* Phase Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 h-10 w-full">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex-1 gap-1.5 text-xs">
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="text-[9px] text-[#9aa8a0]">P{tab.phase}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ====== Phase 1: 资产盘点 ====== */}
        <TabsContent value="assets" className="space-y-4">
          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#122820]">
                <PackageOpen className="h-4 w-4 text-[#1a5632]" /> Phase 1 — 资产盘点
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setScanOpen(true)}
                >
                  <Search className="h-3.5 w-3.5" />
                  从现有数据扫描
                </Button>
                <Button
                  size="sm"
                  className={cn("gap-1.5 text-xs", siteTheme.btnPrimary)}
                  onClick={() => {
                    setEditAsset(null);
                    setShowAssetForm(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  录入资产
                </Button>
              </div>
            </div>

            {/* 资产录入/编辑表单 */}
            {showAssetForm && (
              <div className="mb-6 rounded-lg border border-[#1a5632]/12 bg-[#f6f5f1]/50 p-4">
                <DirectionAssetForm
                  slug={slug}
                  onSave={handleAssetSave}
                  onCancel={() => {
                    setShowAssetForm(false);
                    setEditAsset(null);
                  }}
                  editAsset={editAsset}
                />
              </div>
            )}

            {/* 资产列表 */}
            <DirectionAssetList
              assets={assets}
              onEdit={(asset) => {
                setEditAsset(asset);
                setShowAssetForm(true);
              }}
              onDelete={handleAssetDelete}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("contract")}>
              下一步：预承诺 <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>

        {/* ====== Phase 2: Socratic 预承诺 ====== */}
        <TabsContent value="contract" className="space-y-4">
          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#122820]">
              <ClipboardCheck className="h-4 w-4 text-[#1a5632]" /> Phase 2 — 设定评价标准
            </h3>

            <DirectionSocraticDialog
              direction={direction}
              onComplete={handleRefreshDirection}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("assets")}>
              <ArrowRight className="h-3 w-3 rotate-180" /> 上一步：资产盘点
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("analysis")}>
              下一步：8 维度分析 <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>

        {/* ====== Phase 3: 8 维度分析 ====== */}
        <TabsContent value="analysis" className="space-y-4">
          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <DirectionAnalysisPanel
              slug={slug}
              hasContract={hasContract}
              assetCount={assets.length}
              candidates={(analysis.paperCandidates as PaperCandidate[] | undefined) || []}
              synthesis={(analysis.synthesis || null) as SynthesisResult | null}
              onAnalysisDone={handleRefreshDirection}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("contract")}>
              <ArrowRight className="h-3 w-3 rotate-180" /> 上一步：预承诺
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("roadmap")}>
              下一步：论文路线图 <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>

        {/* ====== Phase 4: 论文路线图 ====== */}
        <TabsContent value="roadmap" className="space-y-4">
          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#122820]">
              <Map className="h-4 w-4 text-[#1a5632]" /> Phase 4 — 论文路线图
            </h3>

            {/* 仪表盘 */}
            <div className="mb-6">
              <DirectionDashboard
                assetCount={assets.length}
                analysisDone={!!analysis.dimensions}
                analysisScore={
                  analysis.dimensions
                    ? Math.round(
                        ((analysis.dimensions as Array<Record<string, unknown>>).reduce(
                          (s, d) => s + ((d.score as number) || 0), 0
                        ) /
                          (analysis.dimensions as Array<Record<string, unknown>>).length) *
                          10
                      ) / 10
                    : null
                }
                roadmap={(direction.roadmap as DirectionDTO["roadmap"]) || null}
                onJumpToTab={setActiveTab}
              />
            </div>

            {/* 路线图时间线 */}
            <DirectionRoadmapTimeline
              slug={slug}
              existingRoadmap={(direction.roadmap as DirectionDTO["roadmap"]) || null}
              candidates={(analysis.paperCandidates as Array<{
                id: string;
                title: string;
                tier: string;
                overallScore: number;
                suggestedJournal?: string;
              }>) || []}
              onRoadmapGenerated={handleRefreshDirection}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("analysis")}>
              <ArrowRight className="h-3 w-3 rotate-180" /> 上一步：8 维度分析
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* 扫描对话框 */}
      <DirectionAssetScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        slug={slug}
        onImport={handleScanImport}
      />
    </>
  );
}
