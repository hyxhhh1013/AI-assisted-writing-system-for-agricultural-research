"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Database, ExternalLink, Loader2, Search, BookMarked } from "lucide-react";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";
import { cn } from "@/lib/utils";
import {
  importExternalReference,
  ingestExternalToKnowledge,
  searchLiterature,
} from "@/services/external-literature";
import { listProjects, type ProjectListItem } from "@/services/project";

const SOURCE_LABELS: Record<ExternalLiteratureHit["source"], string> = {
  openalex: "OpenAlex",
  "semantic-scholar": "S2",
  crossref: "CrossRef",
  pubmed: "PubMed",
};

function HitCard({
  hit,
  projectId,
  directionSlug,
  category,
  onImported,
}: {
  hit: ExternalLiteratureHit;
  projectId: string;
  directionSlug?: string;
  /** 知识库目标分类；空则服务端自动推断 */
  category?: string;
  onImported: (message: string, kind?: "reference" | "corpus" | "knowledge") => void;
}) {
  const [importingRef, setImportingRef] = useState(false);
  const [importingKb, setImportingKb] = useState(false);
  const citation = formatExternalLiteratureHit(hit);
  const link = hit.doi ? `https://doi.org/${hit.doi}` : hit.url;
  const busy = importingRef || importingKb;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(citation);
    onImported("已复制 GB/T 引用");
  };

  const handleImportRef = async () => {
    if (directionSlug) {
      setImportingRef(true);
      try {
        const { importExternalToCorpus } = await import("@/services/direction-literature");
        await importExternalToCorpus(directionSlug, hit, "supporting");
        onImported("已加入方向文献 corpus", "corpus");
      } catch (e) {
        onImported(e instanceof Error ? e.message : "导入失败");
      } finally {
        setImportingRef(false);
      }
      return;
    }
    if (!projectId) {
      onImported("请先选择项目");
      return;
    }
    setImportingRef(true);
    try {
      await importExternalReference(projectId, hit);
      onImported("已加入项目参考文献（并尝试同步知识库）", "reference");
    } catch (e) {
      onImported(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImportingRef(false);
    }
  };

  const handleIngestKnowledge = async () => {
    setImportingKb(true);
    try {
      const res = await ingestExternalToKnowledge({
        hit,
        category: category?.trim() || undefined,
        directionSlug: directionSlug || undefined,
      });
      onImported(res.message, "knowledge");
    } catch (e) {
      onImported(e instanceof Error ? e.message : "加入知识库失败");
    } finally {
      setImportingKb(false);
    }
  };

  const authorLine = hit.authors.slice(0, 4).join(", ") + (hit.authors.length > 4 ? " 等" : "");

  return (
    <Card className="border-[#1a5632]/10">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base font-medium leading-snug">{hit.title}</CardTitle>
          <div className="flex flex-wrap gap-1 shrink-0">
            <Badge variant="secondary">{SOURCE_LABELS[hit.source]}</Badge>
            {hit.isOpenAccess && <Badge className="bg-emerald-600">OA</Badge>}
            {hit.citedByCount != null && (
              <Badge variant="outline">被引 {hit.citedByCount}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {authorLine && <p className="text-muted-foreground">{authorLine}</p>}
        <p className="text-muted-foreground">
          {[hit.journal, hit.year].filter(Boolean).join(" · ")}
          {hit.volume ? ` · ${hit.volume}${hit.issue ? `(${hit.issue})` : ""}` : ""}
          {hit.pages ? `:${hit.pages}` : ""}
        </p>
        {hit.abstract && (
          <p className="line-clamp-3 text-muted-foreground/90">{hit.abstract}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              查看
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleCopy()} disabled={busy}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            复制 GB/T
          </Button>
          {!directionSlug && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleIngestKnowledge()}
              title="有 OA 则下载 PDF 并增量索引；仅摘要则摘要入库；否则仅书目占位"
            >
              {importingKb ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Database className="mr-1 h-3.5 w-3.5" />
              )}
              加入知识库
            </Button>
          )}
          <Button
            size="sm"
            disabled={busy || (!directionSlug && !projectId)}
            onClick={() => void handleImportRef()}
          >
            {importingRef ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookMarked className="mr-1 h-3.5 w-3.5" />
            )}
            {directionSlug ? "加入 corpus" : "加入参考文献"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function KnowledgeExternalSearch({
  fixedProjectId,
  directionSlug,
  compact = false,
  categories,
  onReferenceImported,
  onCorpusImported,
  onKnowledgeIngested,
}: {
  /** 工作台内嵌：锁定当前项目，隐藏项目下拉 */
  fixedProjectId?: string;
  /** Direction 资产盘点：加入文献 corpus */
  directionSlug?: string;
  compact?: boolean;
  /** 知识库页传入分类列表（不含「全部」） */
  categories?: string[];
  onReferenceImported?: () => void;
  onCorpusImported?: () => void;
  onKnowledgeIngested?: () => void;
} = {}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<ExternalLiteratureHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [category, setCategory] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const categoryOptions = (categories ?? []).filter((c) => c && c !== "全部");

  useEffect(() => {
    if (directionSlug || fixedProjectId) {
      if (fixedProjectId) setProjectId(fixedProjectId);
      return;
    }
    void listProjects().then((list) => {
      setProjects(list);
      const fromUrl = searchParams.get("projectId");
      if (fromUrl && list.some((p) => p.id === fromUrl)) {
        setProjectId(fromUrl);
      } else if (list.length > 0) {
        setProjectId(list[0].id);
      }
    });
  }, [searchParams, fixedProjectId, directionSlug]);

  const showToast = useCallback(
    (message: string, kind?: "reference" | "corpus" | "knowledge") => {
      setToast(message);
      window.setTimeout(() => setToast(null), 4500);
      if (kind === "corpus") onCorpusImported?.();
      else if (kind === "reference") onReferenceImported?.();
      else if (kind === "knowledge") onKnowledgeIngested?.();
    },
    [onReferenceImported, onCorpusImported, onKnowledgeIngested],
  );

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      showToast("检索词至少 2 个字符");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchLiterature(q, 12);
      setHits(res.hits);
    } catch (e) {
      setHits([]);
      showToast(e instanceof Error ? e.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-muted-foreground">
          聚合 OpenAlex、Semantic Scholar、CrossRef、PubMed。
          <strong className="font-medium text-foreground">「加入知识库」</strong>
          会尝试 OA PDF 下载并增量索引；仅有摘要则摘要入库；无 OA/摘要则仅书目占位。
          「加入参考文献」写入当前项目（也会顺带尝试同步知识库）。
        </p>
      )}

      <div className={cn("flex flex-col gap-3", !compact && "md:flex-row md:items-center")}>
        <div className="relative flex-1 flex gap-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className={cn("pl-9", compact && "h-8 text-xs")}
            placeholder="关键词或 DOI，如 10.1016/j.soilbio.2020.108123"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch();
            }}
          />
          <Button size={compact ? "sm" : "default"} onClick={() => void handleSearch()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "检索"}
          </Button>
        </div>

        {!directionSlug && categoryOptions.length > 0 && (
          <div className="w-full md:w-48">
            <Select
              value={category || "__auto__"}
              onValueChange={(value) => {
                if (!value || value === "__auto__") setCategory("");
                else setCategory(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="入库分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">自动分类</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!fixedProjectId && !directionSlug && (
          <div className="w-full md:w-64">
            <Select
              value={projectId}
              onValueChange={(value) => {
                if (value) setProjectId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择目标项目" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!fixedProjectId && !directionSlug && projects.length === 0 && (
        <p className="text-sm text-amber-700">
          未创建项目时仍可「加入知识库」；「加入参考文献」需要先有项目。
        </p>
      )}

      {toast && (
        <p className="text-sm text-[#1a5632] font-medium">{toast}</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在检索外部文献库…
        </div>
      )}

      {!loading && searched && hits.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">未找到匹配文献，可换关键词或 DOI 重试。</p>
      )}

      {!loading && hits.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">共 {hits.length} 条（已按 DOI/标题去重）</p>
          {hits.map((hit) => (
            <HitCard
              key={hit.id}
              hit={hit}
              projectId={projectId}
              directionSlug={directionSlug}
              category={category}
              onImported={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
