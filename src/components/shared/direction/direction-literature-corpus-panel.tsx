"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookMarked, Globe, Library, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { DirectionLiteratureState } from "@/contracts/direction-literature";
import {
  MIN_REVIEW_CORPUS_ENTRIES,
  countCoreLiterature,
} from "@/contracts/direction-literature";
import type { SourceRole } from "@/contracts/direction-writing-bridge";
import { KnowledgeExternalSearch } from "@/components/shared/knowledge/knowledge-external-search";
import { DirectionLiteratureKnowledgePicker } from "@/components/shared/direction/direction-literature-knowledge-picker";
import {
  confirmLiteratureCorpus,
  patchLiteratureCorpus,
} from "@/services/direction-literature";

type CorpusView = "external" | "knowledge";

interface DirectionLiteratureCorpusPanelProps {
  slug: string;
  literatureCorpus: DirectionLiteratureState;
  onUpdated: (state: DirectionLiteratureState) => void;
  className?: string;
}

const ROLE_LABELS: Record<SourceRole, string> = {
  core: "核心",
  supporting: "支撑",
  background: "背景",
};

export function DirectionLiteratureCorpusPanel({
  slug,
  literatureCorpus,
  onUpdated,
  className,
}: DirectionLiteratureCorpusPanelProps) {
  const [view, setView] = useState<CorpusView>("external");
  const [confirming, setConfirming] = useState(false);

  const entries = literatureCorpus.entries;
  const confirmed = Boolean(literatureCorpus.confirmedAt);
  const coreCount = countCoreLiterature(literatureCorpus);
  const canConfirm = entries.length >= MIN_REVIEW_CORPUS_ENTRIES && !confirmed;

  const handleRefresh = useCallback(
    (state: DirectionLiteratureState) => {
      onUpdated(state);
    },
    [onUpdated],
  );

  const handleCorpusImported = useCallback(async () => {
    const { getDirection } = await import("@/services/direction");
    const dto = await getDirection(slug);
    if (dto.literatureCorpus) handleRefresh(dto.literatureCorpus);
  }, [slug, handleRefresh]);

  const handleConfirm = async () => {
    if (entries.length < MIN_REVIEW_CORPUS_ENTRIES) {
      toast.error(`综述 corpus 至少需要 ${MIN_REVIEW_CORPUS_ENTRIES} 篇文献`);
      return;
    }
    setConfirming(true);
    try {
      const dto = await confirmLiteratureCorpus(slug);
      if (dto.literatureCorpus) {
        handleRefresh(dto.literatureCorpus);
        toast.success("文献 corpus 已确认，可进入路线图创建写作项目");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    } finally {
      setConfirming(false);
    }
  };

  const handleRoleChange = async (entryId: string, role: SourceRole) => {
    try {
      const dto = await patchLiteratureCorpus(slug, [
        { op: "set_role", entryId, role },
      ]);
      if (dto.literatureCorpus) handleRefresh(dto.literatureCorpus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新角色失败");
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      const dto = await patchLiteratureCorpus(slug, [{ op: "delete", entryId }]);
      if (dto.literatureCorpus) handleRefresh(dto.literatureCorpus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const viewTabs = (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => setView("external")}
        className={cn(
          "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
          view === "external"
            ? "bg-[#1a5632] text-white"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Globe className="h-3 w-3" />
        外部检索
      </button>
      <button
        type="button"
        onClick={() => setView("knowledge")}
        className={cn(
          "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
          view === "knowledge"
            ? "bg-[#1a5632] text-white"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Library className="h-3 w-3" />
        知识库 PDF
      </button>
    </div>
  );

  return (
    <div className={cn("rounded-xl border border-[#6366f1]/15 bg-[#6366f1]/[0.03] p-5 space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#122820]">
            <BookMarked className="h-4 w-4 text-[#6366f1]" />
            P1 · 文献 corpus（备料）
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#6b7c72] max-w-xl">
            综述型写作在此确定文献范围；创建写作项目时将自动写入参考文献。工作台侧仅负责扩写（P2+）。
          </p>
        </div>
        {confirmed ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#059669]/10 px-2 py-1 text-[10px] font-medium text-[#059669]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已确认 · {entries.length} 篇（核心 {coreCount}）
          </span>
        ) : (
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={!canConfirm || confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            确认 corpus（≥{MIN_REVIEW_CORPUS_ENTRIES} 篇）
          </Button>
        )}
      </div>

      {viewTabs}

      <div className="rounded-lg border border-[#1a5632]/10 bg-white p-3">
        {view === "external" ? (
          <KnowledgeExternalSearch
            directionSlug={slug}
            compact
            onCorpusImported={() => void handleCorpusImported()}
          />
        ) : (
          <DirectionLiteratureKnowledgePicker
            slug={slug}
            onImported={() => void handleCorpusImported()}
          />
        )}
      </div>

      {entries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9aa8a0]">
            已纳入 corpus（{entries.length}）
          </p>
          <div className="max-h-[220px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md border bg-white px-2 py-1.5 text-[10px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#122820] truncate">{entry.title}</p>
                  <p className="text-[#9aa8a0] truncate mt-0.5">{entry.citation.slice(0, 80)}…</p>
                </div>
                <select
                  className="h-7 rounded border text-[10px] shrink-0"
                  value={entry.role}
                  disabled={confirmed}
                  onChange={(e) =>
                    void handleRoleChange(entry.id, e.target.value as SourceRole)
                  }
                >
                  {(Object.keys(ROLE_LABELS) as SourceRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {!confirmed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-red-600"
                    onClick={() => void handleDelete(entry.id)}
                  >
                    删
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
