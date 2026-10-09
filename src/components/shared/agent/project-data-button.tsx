"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Database, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import type { DataThemeProposal, DataThemeUnassigned } from "@/lib/data-themes";
import { fetchStoredTablePreview } from "@/services/data-preview";
import { patchProjectFields } from "@/services/project";
import { proposeDataThemes } from "@/lib/data-themes";
import {
  storedTableDetail,
  type TableSnapshot,
} from "@/lib/data-table-snapshot";
import { cn } from "@/lib/utils";

const TYPE_LABEL = { numeric: "数值", group: "分组", text: "文本" } as const;

function splitStoredName(fileName: string): { file: string; label: string } {
  const mark = fileName.indexOf(" · ");
  if (mark === -1) return { file: fileName, label: "整表" };
  const label = fileName.slice(mark + 3).trim();
  return { file: fileName.slice(0, mark).trim(), label: label || "未命名" };
}

/** 仪器参数和上次切坏的短块，不跟谱图抢同一列。 */
function isSideNote(source: DataSourceAnalysis): boolean {
  if (source.rowCount >= 30) return false;
  if (source.fileName.includes("败")) return true;
  const joined = source.columns.map((column) => column.name).join(" ");
  if (/acquisition time|source gun|dwell time|number of scans/i.test(joined)) return true;
  return source.rowCount <= 12
    && source.columns.length <= 2
    && source.columns.some((column) => column.type === "text" && column.name.length > 16);
}

function isNumericCell(value: string): boolean {
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim());
}

function sourceIdsFor(fileName: string): Set<string> {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const ingest = `D-${stem.replace(/[^a-zA-Z0-9一-鿿]/g, "_").replace(/_+/g, "_")}`;
  const raw = `D-${fileName.replace(/[^a-zA-Z0-9一-鿿]/g, "_").replace(/_+/g, "_").replace(/\.\w+$/, "")}`;
  return new Set([ingest, raw]);
}

function rangeChips(source: DataSourceAnalysis): { name: string; range?: string }[] {
  return source.columns.slice(0, 6).map((column) => {
    const stat = source.stats.find((item) => item.variable === column.name);
    if (!stat || column.type !== "numeric") return { name: column.name || "未命名" };
    return { name: column.name || "未命名", range: `${stat.min}–${stat.max}` };
  });
}

function tableText(snapshot: TableSnapshot | null, source: DataSourceAnalysis): string {
  if (!snapshot) return source.columns.map((column) => column.name).join("\t");
  const lines = [snapshot.headers.join("\t")];
  for (const row of snapshot.preview) lines.push(row.join("\t"));
  if (snapshot.previewTail && snapshot.previewTail.length > 0) {
    lines.push("…");
    for (const row of snapshot.previewTail) lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

function askText(
  source: DataSourceAnalysis,
  snapshot: TableSnapshot | null,
  label: { file: string; label: string },
): string {
  const ranges = rangeChips(source)
    .filter((chip) => chip.range)
    .map((chip) => `${chip.name} ${chip.range}`)
    .join("；");
  const head = snapshot?.preview.slice(0, 3).map((row) => row.join("\t")).join("\n") ?? "";
  return [
    `看一下已入库的数据块「${label.label}」（${label.file}，${source.rowCount} 行，${source.columns.length} 列）。`,
    `列：${source.columns.map((column) => column.name).filter(Boolean).join("、") || "无"}`,
    ranges ? `入库时记下的范围：${ranges}` : "",
    head ? `表头附近几行：\n${head}` : "",
    "用两三句话说明这张表在读什么。只使用上面出现的数，不要补相关、趋势或均值，也不要写进正文。",
  ].filter(Boolean).join("\n");
}

function matchLabel(matched: TableSnapshot["matched"]): string | null {
  if (matched === "file-head") return "没有对上这一块，显示的是原文件开头";
  if (matched === "columns") return "按列名在原文件里对上的一段";
  return null;
}

interface FileGroup {
  file: string;
  tables: DataSourceAnalysis[];
  notes: DataSourceAnalysis[];
}

function groupSources(sources: DataSourceAnalysis[], query: string): FileGroup[] {
  const q = query.trim().toLowerCase();
  const map = new Map<string, DataSourceAnalysis[]>();
  for (const source of sources) {
    const { file, label } = splitStoredName(source.fileName);
    const columns = source.columns.map((column) => column.name).join(" ");
    if (q && !`${file} ${label} ${columns}`.toLowerCase().includes(q)) continue;
    const list = map.get(file) ?? [];
    list.push(source);
    map.set(file, list);
  }
  return [...map.entries()].map(([file, items]) => {
    const tables = items.filter((item) => !isSideNote(item));
    const notes = items.filter(isSideNote);
    tables.sort((a, b) => b.rowCount - a.rowCount);
    return { file, tables, notes };
  });
}

function DataGrid({ snapshot }: { snapshot: TableSnapshot }) {
  const hidden = Math.max(
    0,
    snapshot.rowCount - snapshot.preview.length - (snapshot.previewTail?.length ?? 0),
  );
  const note = matchLabel(snapshot.matched);
  const colSpan = snapshot.headers.length + 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[12px] text-[#122820]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#e7efe9] text-[11px] text-[#3d4f46]">
              <th className="w-10 px-2 py-1.5 text-right font-medium">#</th>
              {snapshot.headers.map((header, i) => (
                <th key={`${header}-${i}`} className="whitespace-nowrap px-3 py-1.5 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[11.5px] tabular-nums">
            {snapshot.preview.map((row, r) => (
              <tr key={`h-${r}`} className={r % 2 === 1 ? "bg-[#f6f8f6]" : "bg-white"}>
                <td className="px-2 py-1 text-right text-[10px] text-[#8aa090]">{r + 1}</td>
                {snapshot.headers.map((_, c) => {
                  const value = row[c] ?? "";
                  return (
                    <td
                      key={c}
                      className={cn("whitespace-nowrap px-3 py-1", isNumericCell(value) && "text-right")}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
            {hidden > 0 ? (
              <tr className="bg-[#f8f4ec]">
                <td colSpan={colSpan} className="px-3 py-1.5 text-center font-sans text-[11px] text-[#8a5a20]">
                  中间省略 {hidden} 行
                </td>
              </tr>
            ) : null}
            {snapshot.previewTail?.map((row, r) => {
              const index = snapshot.rowCount - (snapshot.previewTail?.length ?? 0) + r + 1;
              return (
                <tr key={`t-${r}`} className="bg-white">
                  <td className="px-2 py-1 text-right text-[10px] text-[#8aa090]">{index}</td>
                  {snapshot.headers.map((_, c) => {
                    const value = row[c] ?? "";
                    return (
                      <td
                        key={c}
                        className={cn("whitespace-nowrap px-3 py-1", isNumericCell(value) && "text-right")}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note ? (
        <p className="border-t border-[#e6d3b0] bg-[#fbf8f2] px-3 py-1.5 text-[11px] text-[#8a5a20]">{note}</p>
      ) : null}
    </div>
  );
}

function ColumnFallback({ source }: { source: DataSourceAnalysis }) {
  const curve = source.rowCount >= 20 && source.columns.every((column) => column.type === "numeric");
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
      <p className="mb-3 text-[12px] leading-5 text-[#8a5a20]">
        原文件不在对话附件里，看不到逐行数值。下面是入库时记下的列。
      </p>
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="bg-[#e7efe9] text-[11px] text-[#3d4f46]">
            <th className="px-3 py-1.5 font-medium">列</th>
            <th className="px-3 py-1.5 font-medium">类型</th>
            <th className="px-3 py-1.5 font-medium">非空</th>
            <th className="px-3 py-1.5 font-medium">最小</th>
            <th className="px-3 py-1.5 font-medium">最大</th>
            {curve ? null : <th className="px-3 py-1.5 font-medium">均值</th>}
          </tr>
        </thead>
        <tbody>
          {source.columns.map((column, index) => {
            const stat = source.stats.find((item) => item.variable === column.name);
            return (
              <tr key={`${column.name}-${index}`} className={index % 2 === 1 ? "bg-[#f6f8f6]" : undefined}>
                <td className="px-3 py-1.5">{column.name || "未命名"}</td>
                <td className="px-3 py-1.5 text-[#5a7a68]">{TYPE_LABEL[column.type]}</td>
                <td className="px-3 py-1.5 tabular-nums">{column.count}</td>
                <td className="px-3 py-1.5 tabular-nums">{stat ? stat.min : "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{stat ? stat.max : "—"}</td>
                {curve ? null : <td className="px-3 py-1.5 tabular-nums">{stat ? stat.mean : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BlockButton({
  source,
  active,
  onSelect,
  caption,
  hint,
}: {
  source: DataSourceAnalysis;
  active: boolean;
  onSelect: () => void;
  caption?: string;
  hint?: string;
}) {
  const { label } = splitStoredName(source.fileName);
  return (
    <button
      type="button"
      onClick={onSelect}
      title={hint}
      className={cn(
        "flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left",
        active ? "bg-white text-[#1a5632] shadow-sm ring-1 ring-[#1a5632]/15" : "text-[#122820] hover:bg-white/70",
      )}
    >
      <span className="min-w-0 truncate text-[12px]">{caption || label}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-[#8aa090]">{source.rowCount} 行</span>
    </button>
  );
}

function ThemeList({
  themes,
  unassigned,
  sources,
  selectedName,
  onSelect,
}: {
  themes: DataThemeProposal[];
  unassigned: DataThemeUnassigned[];
  sources: DataSourceAnalysis[];
  selectedName: string | null;
  onSelect: (fileName: string) => void;
}) {
  if (themes.length === 0 && unassigned.length === 0) {
    return <p className="px-1 py-4 text-[12px] text-[#8aa090]">没有对得上的主题</p>;
  }
  return (
    <>
      {themes.map((theme) => (
        <section key={theme.id} className="mb-3">
          <div className="px-1 py-1">
            <p className="text-[12px] font-medium text-[#122820]">{theme.title}</p>
            <p className="text-[10px] leading-4 text-[#5a7a68]">
              {new Set(theme.members.map((member) => member.file)).size} 个文件 · {theme.evidence}
            </p>
          </div>
          <div className="space-y-0.5">
            {theme.members.map((member) => {
              const source = sources.find((item) => item.fileName === member.fileName);
              if (!source) return null;
              return (
                <BlockButton
                  key={member.fileName}
                  source={source}
                  active={source.fileName === selectedName}
                  onSelect={() => onSelect(source.fileName)}
                  caption={member.sample}
                />
              );
            })}
          </div>
        </section>
      ))}
      {unassigned.length > 0 ? (
        <section className="mb-3">
          <p className="px-1 py-1 text-[11px] text-[#8a5a20]">未归入</p>
          <div className="space-y-0.5">
            {unassigned.map((item) => {
              const source = sources.find((entry) => entry.fileName === item.fileName);
              if (!source) return null;
              return (
                <BlockButton
                  key={item.fileName}
                  source={source}
                  active={source.fileName === selectedName}
                  onSelect={() => onSelect(source.fileName)}
                  caption={splitStoredName(source.fileName).file}
                  hint={item.reason}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function ProjectDataButton({
  sources,
  claims = [],
  projectId,
  askDisabled,
  onAsk,
  onChanged,
}: {
  sources: DataSourceAnalysis[];
  claims?: EvidenceClaim[];
  projectId?: string;
  askDisabled?: boolean;
  onAsk?: (goal: string) => void;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"file" | "theme">("file");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, TableSnapshot | null>>({});
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const groups = useMemo(() => groupSources(sources, query), [sources, query]);
  const themeReport = useMemo(
    () => proposeDataThemes(sources.filter((source) => !isSideNote(source))),
    [sources],
  );
  const q = query.trim().toLowerCase();
  const visibleThemes = themeReport.themes
    .map((theme) => ({
      ...theme,
      members: theme.members.filter((member) =>
        !q || `${theme.title} ${member.file} ${member.sample} ${member.label}`.toLowerCase().includes(q),
      ),
    }))
    .filter((theme) => theme.members.length > 0);
  const visibleUnassigned = themeReport.unassigned.filter((item) =>
    !q || `${item.file} ${item.label} ${item.reason}`.toLowerCase().includes(q),
  );
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const selected = sources.find((source) => source.fileName === selectedName) ?? null;
  const fileCount = new Set(sources.map((source) => splitStoredName(source.fileName).file)).size;

  useEffect(() => {
    if (!open) return;
    if (selectedName && sources.some((source) => source.fileName === selectedName)) return;
    const first = sources.find((source) => !isSideNote(source)) ?? sources[0];
    setSelectedName(first?.fileName ?? null);
  }, [open, selectedName, sources]);

  useEffect(() => {
    if (!open || !selectedName || !projectId) return;
    const current = sourcesRef.current.find((source) => source.fileName === selectedName);
    if (!current || storedTableDetail(current) || loaded[selectedName] !== undefined) return;
    let cancelled = false;
    setLoadingName(selectedName);
    void fetchStoredTablePreview(projectId, selectedName)
      .then((snapshot) => {
        if (cancelled) return;
        setLoaded((prev) => ({ ...prev, [selectedName]: snapshot }));
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded((prev) => ({ ...prev, [selectedName]: null }));
      })
      .finally(() => {
        if (!cancelled) setLoadingName((current) => (current === selectedName ? null : current));
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedName, projectId, loaded]);

  useEffect(() => {
    setConfirmRemove(false);
  }, [selectedName]);

  const snapshot = selected ? (storedTableDetail(selected) ?? loaded[selected.fileName] ?? null) : null;
  const loading = selected != null && loadingName === selected.fileName && !snapshot;
  const selectedLabel = selected ? splitStoredName(selected.fileName) : null;
  const chips = selected ? rangeChips(selected) : [];
  const extraColumns = selected ? Math.max(0, selected.columns.length - chips.length) : 0;

  const copyTable = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(tableText(snapshot, selected));
      toast.success("已复制可见的表");
    } catch {
      toast.error("复制失败");
    }
  };

  const askAgent = () => {
    if (!selected || !selectedLabel || !onAsk) return;
    if (askDisabled) {
      toast.message("请等当前任务结束后再交给助手");
      return;
    }
    const theme = themeReport.themes.find((item) =>
      item.members.some((member) => member.fileName === selected.fileName),
    );
    const samples = theme
      ? [...new Set(theme.members.map((member) => member.sample))].join("、")
      : "";
    const note = theme
      ? `\n这一块可以和这些样品看成同一个主题「${theme.title}」：${samples}。只根据表里出现的内容说，不要把对不上的数字并进去。`
      : "";
    onAsk(askText(selected, snapshot, selectedLabel) + note);
    setOpen(false);
  };

  const removeSelected = async () => {
    if (!selected || !projectId) return;
    setRemoving(true);
    try {
      const ids = sourceIdsFor(selected.fileName);
      await patchProjectFields(projectId, {
        dataSources: sources.filter((item) => item.fileName !== selected.fileName),
        dataClaims: claims.filter((claim) => !ids.has(claim.sourceId)),
      });
      toast.success("已从项目移出");
      setConfirmRemove(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移出失败");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        title="逐条查看已入库的数据"
        onClick={() => setOpen(true)}
      >
        <Database className="mr-1 h-3.5 w-3.5" />
        数据{sources.length > 0 ? ` ${sources.length}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(82vh,720px)] w-[min(1040px,calc(100%-1.5rem))] max-w-none flex-col gap-0 overflow-hidden bg-[#f4f7f4] p-0 sm:max-w-[1040px]">
          <div className="flex items-center gap-2.5 border-b border-[#1a5632]/12 bg-gradient-to-r from-[#f4f7f4] to-white px-4 py-3 pr-12">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1a5632] text-white">
              <Database className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>已入库的数据</DialogTitle>
              <DialogDescription className="mt-1 text-[12px]">
                {sources.length === 0
                  ? "确认入库之后会出现在这里。"
                  : view === "theme"
                    ? `${themeReport.themes.length} 个主题建议 · 未确认，不改原文件`
                    : `${fileCount} 个文件 · ${sources.length} 块`}
              </DialogDescription>
            </div>
          </div>
          {sources.length === 0 ? (
            <p className="px-4 py-8 text-[13px] leading-6 text-[#5a7a68]">
              还没有确认入库的数据。在对话里上传后，助手给出读法，你勾选才会出现在这里。
            </p>
          ) : (
            <div className="flex min-h-0 flex-1">
              <aside className="flex w-[248px] shrink-0 flex-col border-r border-[#1a5632]/12 bg-[#f4f7f4]">
                <div className="px-2 pt-2">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={view === "theme" ? "搜索主题或样品" : "搜索文件或列"}
                    className="h-8 bg-white text-[12px]"
                  />
                  <div className="mt-2 flex rounded-md bg-white p-0.5 text-[11px] ring-1 ring-[#1a5632]/15">
                    <button
                      type="button"
                      className={cn("flex-1 rounded px-2 py-1", view === "file" ? "bg-[#1a5632] text-white" : "text-[#3d4f46]")}
                      onClick={() => setView("file")}
                    >
                      按文件
                    </button>
                    <button
                      type="button"
                      className={cn("flex-1 rounded px-2 py-1", view === "theme" ? "bg-[#1a5632] text-white" : "text-[#3d4f46]")}
                      onClick={() => setView("theme")}
                    >
                      按主题
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  {view === "theme" ? (
                    <ThemeList
                      themes={visibleThemes}
                      unassigned={visibleUnassigned}
                      sources={sources}
                      selectedName={selectedName}
                      onSelect={setSelectedName}
                    />
                  ) : groups.length === 0 ? (
                    <p className="px-1 py-4 text-[12px] text-[#8aa090]">没有匹配的表</p>
                  ) : groups.map((group) => (
                    <section key={group.file} className="mb-3">
                      <div className="flex items-center gap-1.5 px-1 py-1">
                        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-[#1a5632]" />
                        <span className="min-w-0 truncate text-[11px] font-medium text-[#3d4f46]" title={group.file}>
                          {group.file}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {group.tables.map((source) => (
                          <BlockButton
                            key={source.fileName}
                            source={source}
                            active={source.fileName === selectedName}
                            onSelect={() => setSelectedName(source.fileName)}
                          />
                        ))}
                      </div>
                      {group.notes.length > 0 ? (
                        <div className="mt-1">
                          {query.trim() ? null : (
                            <button
                              type="button"
                              className="px-2 py-1 text-[11px] text-[#8a5a20]"
                              onClick={() => setNotesOpen((prev) => ({ ...prev, [group.file]: !prev[group.file] }))}
                            >
                              {notesOpen[group.file] ? "收起" : "还有"} {group.notes.length} 段参数
                            </button>
                          )}
                          {notesOpen[group.file] || query.trim() ? (
                            <div className="space-y-0.5 opacity-80">
                              {group.notes.map((source) => (
                                <BlockButton
                                  key={source.fileName}
                                  source={source}
                                  active={source.fileName === selectedName}
                                  onSelect={() => setSelectedName(source.fileName)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              </aside>
              <section className="flex min-w-0 flex-1 flex-col bg-[#f7faf8] p-3">
                {selected && selectedLabel ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#1a5632]/14 bg-white shadow-[0_1px_0_rgba(18,40,32,0.04)]">
                    <div className="border-b border-[#1a5632]/10 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[13px] font-medium text-[#122820]">{selectedLabel.label}</h3>
                          <p className="mt-0.5 truncate text-[11px] text-[#5a7a68]">
                            {selectedLabel.file}
                            {selected.sheetName ? ` · ${selected.sheetName}` : ""}
                            {` · ${selected.rowCount} 行 · ${selected.columns.length} 列`}
                            {selected.peakTable && selected.peakTable.length > 0
                              ? ` · ${selected.peakTable.length} 个峰`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" size="xs" variant="outline" onClick={() => void copyTable()}>
                            <Copy className="size-3" />
                            复制
                          </Button>
                          {projectId ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              render={<a href={`/plot?${new URLSearchParams({ id: projectId, category: "chart", figure: "line", source: selected.fileName }).toString()}`} target="_blank" rel="noreferrer" />}
                            >
                              细调
                            </Button>
                          ) : null}
                          <Button type="button" size="xs" disabled={!onAsk} onClick={askAgent}>
                            交给助手
                          </Button>
                        </div>
                      </div>
                      {chips.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {chips.map((chip, index) => (
                            <span
                              key={`${chip.name}-${index}`}
                              className="max-w-[220px] truncate rounded-full bg-[#1a5632]/8 px-2 py-0.5 text-[11px] text-[#1a5632]"
                            >
                              {chip.name}
                              {chip.range ? <span className="ml-1 tabular-nums text-[#3d4f46]">{chip.range}</span> : null}
                            </span>
                          ))}
                          {extraColumns > 0 ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] text-[#8aa090]">+{extraColumns} 列</span>
                          ) : null}
                        </div>
                      ) : null}
                      {isSideNote(selected) ? (
                        <p className="mt-1.5 text-[11px] text-[#8a5a20]">这段更像仪器参数或切坏的碎片，不是谱图。</p>
                      ) : null}
                    </div>
                    {loading ? (
                      <p className="px-3 py-8 text-[13px] text-[#5a7a68]">正在从原文件读取…</p>
                    ) : null}
                    {!loading && snapshot ? <DataGrid snapshot={snapshot} /> : null}
                    {!loading && !snapshot ? <ColumnFallback source={selected} /> : null}
                    <div className="flex items-center justify-end gap-2 border-t border-[#1a5632]/10 bg-[#f7faf8] px-3 py-2">
                      {confirmRemove ? (
                        <>
                          <span className="mr-auto text-[11px] text-[#8a5a20]">移出后写作不再引用这一块。</span>
                          <Button type="button" size="xs" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>
                            取消
                          </Button>
                          <Button type="button" size="xs" variant="destructive" disabled={removing || !projectId} onClick={() => void removeSelected()}>
                            {removing ? "正在移出" : "确认移出"}
                          </Button>
                        </>
                      ) : (
                        <Button type="button" size="xs" variant="ghost" className="text-[#8a5a20]" disabled={!projectId} onClick={() => setConfirmRemove(true)}>
                          <Trash2 className="size-3" />
                          移出项目
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="px-1 py-8 text-[13px] text-[#5a7a68]">从左侧选一块数据。</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
