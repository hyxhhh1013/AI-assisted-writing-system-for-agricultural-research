import {
  MIN_IMPORT_RELEVANCE,
  enrichImportReferenceParams,
} from "@/lib/agent/literature-relevance";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

/** 为人在环确认卡生成可读说明（含文献导入预览） */
export function buildToolConfirmMessage(
  toolName: string,
  params: Record<string, unknown>,
): { message: string; preview?: string } {
  if (toolName === "import_reference") {
    params = enrichImportReferenceParams(params);
    // 确认卡已注入候选列表（importItems）：按候选数提示批量
    if (Array.isArray(params.importItems) && params.importItems.length > 0) {
      const items = params.importItems as Array<{
        title?: string;
        year?: number;
        doi?: string;
        journal?: string;
      }>;
      const n = items.length;
      const titles = items
        .slice(0, 3)
        .map((x) => String(x.title ?? "").slice(0, 40))
        .filter(Boolean);
      const why = String(params.why ?? "").trim();
      return {
        message:
          `确认批量导入 ${n} 篇文献到项目参考文献？`
          + (titles.length ? `\n含：${titles.join("；")}${n > 3 ? "…" : ""}` : "")
          + (why.length >= 8 ? `\n理由：${why.slice(0, 120)}` : ""),
        preview: titles.join("\n"),
      };
    }
    if (params.hitsJson || params.hitJsons) {
      try {
        const raw = params.hitsJson ?? params.hitJsons;
        const parsed = typeof raw === "string" ? JSON.parse(String(raw)) : raw;
        const arr = Array.isArray(parsed) ? parsed : [];
        const n = arr.length;
        const titles = arr
          .slice(0, 3)
          .map((x: { title?: string }) => String(x?.title ?? "").slice(0, 40))
          .filter(Boolean);
        const why = String(params.why ?? "").trim();
        return {
          message:
            `确认批量导入 ${n} 篇文献到项目参考文献？`
            + (titles.length ? `\n含：${titles.join("；")}${n > 3 ? "…" : ""}` : "")
            + (why.length >= 8 ? `\n理由：${why.slice(0, 120)}` : ""),
          preview: titles.join("\n"),
        };
      } catch {
        /* fallthrough */
      }
    }
    if (params.hitJson) {
      try {
        const hit = JSON.parse(String(params.hitJson)) as {
          title?: string;
          authors?: string[];
          year?: number;
          journal?: string;
          volume?: string;
          issue?: string;
          pages?: string;
          doi?: string;
        };
        const title = (hit.title ?? "文献").trim();
        const year = hit.year ? `（${hit.year}）` : "";
        const doi = hit.doi ? ` DOI: ${hit.doi}` : "";
        const citation = formatExternalLiteratureHit({
          title,
          authors: Array.isArray(hit.authors) ? hit.authors : [],
          year: hit.year,
          journal: hit.journal,
          volume: hit.volume,
          issue: hit.issue,
          pages: hit.pages,
          doi: hit.doi,
        });
        const why = String(params.why ?? "").trim();
        const autoWhy = String(params.autoWhy ?? "").trim();
        const reason = why.length >= 8 ? why : autoWhy;
        const scoreRaw = params.relevanceScore ?? params.score;
        const score =
          typeof scoreRaw === "number"
            ? scoreRaw
            : Number.isFinite(Number(scoreRaw))
              ? Number(scoreRaw)
              : null;
        const scoreBit = score != null ? ` 相关度 ${score}` : "";
        const whyBit = reason ? `\n理由：${reason.slice(0, 120)}` : "";
        const lowBit =
          score != null && score < MIN_IMPORT_RELEVANCE && why.length < 8
            ? "\n（相关度偏低：批准前请在对话里说明 why，或换一篇更相关的）"
            : "";
        return {
          message:
            `确认将「${title.slice(0, 80)}${year}」导入项目参考文献？${doi}${scoreBit}${whyBit}${lowBit}`,
          preview: citation,
        };
      } catch {
        /* fallthrough */
      }
    }
    const doi = String(params.doi ?? "").trim();
    if (doi) {
      return { message: `确认按 DOI「${doi}」检索并导入到参考文献？` };
    }
    if (params.hitIndices != null && String(params.hitIndices).trim()) {
      return {
        message:
          `确认按 hitIndices=[${String(params.hitIndices)}] 批量导入文献到项目参考文献？`
          + "批准后将按最近一次检索结果的对应编号导入。",
      };
    }
  }

  return {
    message: `需要你确认后再执行「${toolName}」。批准后我会继续；取消则跳过。`,
  };
}
