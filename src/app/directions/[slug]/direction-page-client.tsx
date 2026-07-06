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
import { DirectionAssetIntakePanel } from "@/components/shared/direction/direction-asset-intake-panel";
import { DirectionPreCommitmentPanel } from "@/components/shared/direction/direction-pre-commitment-panel";
import { DirectionAnalysisPanel } from "@/components/shared/direction/direction-analysis-panel";
import { DirectionRoadmapTimeline } from "@/components/shared/direction/direction-roadmap-timeline";
import { DirectionDashboard } from "@/components/shared/direction/direction-dashboard";
import { DirectionSocraticDialog } from "@/components/shared/direction/direction-socratic-dialog";
import { DirectionGrantPanel } from "@/components/shared/direction/direction-grant-panel";
import { DirectionPhaseOverview } from "@/components/shared/direction/direction-phase-overview";
import {
  Compass,
  PackageOpen,
  ClipboardCheck,
  BarChart3,
  Map,
  FileText,
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
  scanCandidates,
} from "@/services/direction";
import { useAuth } from "@/lib/auth-context";
import type { DirectionDTO, DirectionAsset, DirectionAnalysis, DirectionRoadmap } from "@/contracts/direction";
import { isAssetAlreadyImported } from "@/lib/direction-asset-health";
import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";
import {
  computeAnalysisReadiness,
  computeRoadmapReadiness,
  computeGrantReadiness,
} from "@/lib/direction-phase-readiness";

type AssetKind = "experiment" | "paper" | "dataset";

const TABS = [
  { id: "assets", label: "资产盘点", icon: PackageOpen, phase: 0 },
  { id: "contract", label: "预承诺", icon: ClipboardCheck, phase: 1 },
  { id: "analysis", label: "8 维度分析", icon: BarChart3, phase: 2 },
  { id: "roadmap", label: "论文路线图", icon: Map, phase: 3 },
  { id: "grant", label: "申报材料", icon: FileText, phase: 4 },
] as const;

export default function DirectionPageClient() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user } = useAuth();
  const isPI = user?.role === "admin";

  const [direction, setDirection] = useState<DirectionDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assets");

  // Phase 0: 方向配置编辑状态
  // Phase 0: 资产编辑状态
  const [formKind, setFormKind] = useState<AssetKind | null>(null);
  const [editAsset, setEditAsset] = useState<DirectionAsset | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingScanCount, setPendingScanCount] = useState<number | null>(null);

  const handleAddAsset = (kind: AssetKind) => {
    setEditAsset(null);
    setFormKind(kind);
  };

  const fetchDirection = useCallback(async () => {
    setIsLoading(true);
    try {
      const dto = await getDirection(slug);
      setDirection(dto);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const message = err instanceof Error ? err.message : "获取方向失败";
      if (status === 401) {
        toast.error("请先登录后访问研究方向");
        router.push(`/login?redirect=${encodeURIComponent(`/directions/${slug}`)}`);
        return;
      }
      if (status === 404) {
        toast.error("方向不存在或无权访问，请确认已登录正确账号");
      } else {
        toast.error(message);
      }
      router.push("/");
    } finally {
      setIsLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    void fetchDirection();
  }, [fetchDirection]);

  // 预加载扫描覆盖率（待导入数量）
  useEffect(() => {
    if (!direction) return;
    const currentAssets = Array.isArray(direction.assets)
      ? (direction.assets as DirectionAsset[])
      : [];
    scanCandidates(slug)
      .then((result) => {
        const allPapers = [...result.paperCandidates, ...result.projectCandidates];
        const newPapers = allPapers.filter((p) => !isAssetAlreadyImported(p, currentAssets));
        const newDatasets = result.datasetCandidates.filter(
          (d) => !currentAssets.some(
            (a) => a.kind === "dataset" && a.title.trim().toLowerCase() === d.title.trim().toLowerCase(),
          ),
        );
        setPendingScanCount(newPapers.length + newDatasets.length);
      })
      .catch(() => setPendingScanCount(null));
  }, [slug, direction?.assets, direction?.updatedAt]);

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
      setFormKind(null);
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

  const analysis = (direction?.analysis as DirectionAnalysis | null) || null;
  const analysisRecord = (direction?.analysis as Record<string, unknown> | null) || {};
  const existingContract = analysisRecord.evaluationContract as
    | { dimensions?: Array<{ id: string; rubrics?: Array<{ id: string; what_to_look_for: string }> }>; confirmedAt?: number }
    | undefined;
  const hasContract = !!existingContract?.confirmedAt;
  const roadmap = (direction?.roadmap as DirectionRoadmap | null) || null;
  const analysisStale = isAnalysisFingerprintStale(assets, analysis);
  const analysisReadiness = computeAnalysisReadiness(assets, analysis);
  const roadmapReadiness = computeRoadmapReadiness(assets, analysis, roadmap);
  const grantReadiness = computeGrantReadiness(assets, analysis, roadmap);

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
        actions={
          <div className="flex items-center gap-2">
            {!isPI && <Badge variant="secondary" className="gap-1 border-[#2563eb]/20 bg-[#2563eb]/8 text-[#2563eb] text-[10px]">浏览</Badge>}
            {isPI && <Badge variant="secondary" className="gap-1 border-[#1a5632]/30 bg-[#1a5632]/8 text-[#1a5632] text-[10px]">PI</Badge>}
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="mb-6">
        <DirectionStatCards
          assets={assets}
          literatureCount={literatureCount}
          analysis={analysis}
        />
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

        {/* ====== Phase 0: 资产盘点 ====== */}
        <TabsContent value="assets" className="space-y-4">
          <DirectionAssetIntakePanel
            assets={assets}
            analysis={analysis}
            literatureCount={literatureCount}
            pendingScanCount={pendingScanCount}
            onScan={() => setScanOpen(true)}
            onAddExperiment={() => handleAddAsset("experiment")}
            onProceed={() => setActiveTab("contract")}
          />

          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#122820]">
                <PackageOpen className="h-4 w-4 text-[#1a5632]" /> 资产清单
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setScanOpen(true)}
              >
                <Search className="h-3.5 w-3.5" />
                从现有数据扫描
                {pendingScanCount != null && pendingScanCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] border-[#6366f1]/20 bg-[#6366f1]/10 text-[#6366f1]">
                    {pendingScanCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* 资产录入/编辑表单 */}
            {formKind !== null && (
              <div className="mb-6 rounded-lg border border-[#1a5632]/12 bg-[#f6f5f1]/50 p-4">
                <DirectionAssetForm
                  slug={slug}
                  existingAssets={assets.filter((a) => a.id !== editAsset?.id)}
                  onSave={handleAssetSave}
                  onCancel={() => {
                    setFormKind(null);
                    setEditAsset(null);
                  }}
                  editAsset={editAsset}
                  initialKind={editAsset ? undefined : formKind}
                />
              </div>
            )}

            {/* 资产列表（三栏并排） */}
            <DirectionAssetList
              assets={assets}
              onEdit={(asset) => {
                setEditAsset(asset);
                setFormKind(asset.kind as AssetKind);
              }}
              onDelete={handleAssetDelete}
              onAdd={handleAddAsset}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("contract")}>
              下一步：预承诺 <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>

        {/* ====== Phase 1: Socratic 预承诺 ====== */}
        <TabsContent value="contract" className="space-y-4">
          <DirectionPreCommitmentPanel
            assets={assets}
            analysis={analysis}
            onJumpToAssets={() => setActiveTab("assets")}
            onJumpToAnalysis={() => setActiveTab("analysis")}
          />

          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
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

        {/* ====== Phase 2: 8 维度分析 ====== */}
        <TabsContent value="analysis" className="space-y-4">
          <DirectionPhaseOverview
            phase={2}
            title="8 维度分析（Paper-Visible）"
            description="按 Phase 1 确认的 Scoring Plan 对资产评分：Writer 逐维 Rubric → Verifier 抽检 D3/D5 → 合成校验 → 写回 adjustedScores。"
            badge="Rubric Scoring"
            checks={analysisReadiness.checks}
            ready={analysisReadiness.ready && !analysisStale}
            onAction={!hasContract ? () => setActiveTab("contract") : undefined}
            actionLabel={!hasContract ? "前往预承诺" : undefined}
          />

          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <DirectionAnalysisPanel
              slug={slug}
              hasContract={hasContract}
              assetCount={assets.length}
              isStale={analysisStale}
              storedDimensions={analysis?.dimensions || []}
              candidates={analysis?.paperCandidates || []}
              synthesis={analysis?.synthesis || null}
              crossOpportunities={analysis?.crossDirectionOpportunities || []}
              onAnalysisDone={handleRefreshDirection}
              onJumpToContract={() => setActiveTab("contract")}
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

        {/* ====== Phase 3: 论文路线图 ====== */}
        <TabsContent value="roadmap" className="space-y-4">
          <DirectionPhaseOverview
            phase={3}
            title="论文路线图"
            description="基于 D5 候选与 8 维分析生成优先级与时间线；确认后可将 ready/需补实验论文桥接到写作工作台。"
            checks={roadmapReadiness.checks}
            ready={roadmapReadiness.ready}
            onAction={!analysis?.dimensions?.length ? () => setActiveTab("analysis") : undefined}
            actionLabel={!analysis?.dimensions?.length ? "前往分析" : undefined}
          />

          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#122820]">
              <Map className="h-4 w-4 text-[#1a5632]" /> Phase 3 — 论文路线图
            </h3>

            <div className="mb-6">
              <DirectionDashboard
                assetCount={assets.length}
                analysisDone={!!analysis?.dimensions}
                analysisScore={
                  analysis?.dimensions
                    ? Math.round(
                        (analysis.dimensions.reduce(
                          (s, d) => s + (d.score || 0), 0
                        ) /
                          analysis.dimensions.length) *
                          10
                      ) / 10
                    : null
                }
                analysisGeneratedAt={analysis?.generatedAt ?? null}
                crossDirectionCount={analysis?.crossDirectionOpportunities?.length ?? 0}
                roadmap={roadmap}
                onJumpToTab={setActiveTab}
              />
            </div>

            <DirectionRoadmapTimeline
              slug={slug}
              existingRoadmap={roadmap}
              candidates={analysis?.paperCandidates || []}
              onRoadmapGenerated={handleRefreshDirection}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("analysis")}>
              <ArrowRight className="h-3 w-3 rotate-180" /> 上一步：8 维度分析
            </Button>
          </div>
        </TabsContent>

        {/* ====== Phase 4: 项目申报 ====== */}
        <TabsContent value="grant" className="space-y-4">
          <DirectionPhaseOverview
            phase={4}
            title="申报材料"
            description="将资产 + 8 维分析 + 路线图合成为基金申请书；研究现状章节接入知识库 RAG，生成结果持久化保存。"
            checks={grantReadiness.checks}
            ready={grantReadiness.ready}
          />

          <div className={cn("rounded-xl border border-[#1a5632]/8 p-6", siteTheme.card)}>
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#122820]">
              <FileText className="h-4 w-4 text-[#1a5632]" /> Phase 4 — 项目申报材料
            </h3>
            <DirectionGrantPanel
              slug={slug}
              direction={direction}
              onGenerated={handleRefreshDirection}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setActiveTab("roadmap")}>
              <ArrowRight className="h-3 w-3 rotate-180" /> 上一步：论文路线图
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* 扫描对话框 */}
      <DirectionAssetScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        slug={slug}
        existingAssets={assets}
        onImport={handleScanImport}
      />
    </>
  );
}
