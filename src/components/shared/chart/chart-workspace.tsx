"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardPaste, Upload, Table2, Palette, Sparkles, BookmarkPlus,
  ChevronDown, ChevronRight,
} from "lucide-react";
import type { ChartPanelPrefill } from "@/contracts/figure";
import {
  buildChartReplayFigureSpec,
  encodeChartAssetReplay,
  type PlotInsertReplay,
} from "@/contracts/figure";
import { ChartFieldForm } from "@/components/shared/chart/chart-field-form";
import { ChartPreviewPane } from "@/components/shared/chart/chart-preview-pane";
import { useChartPanel, type ChartRegistryEntry } from "@/hooks/use-chart-panel";
import type { ChartRegistryField } from "@/contracts/chart-style";

interface ChartWorkspaceProps {
  registryEntry?: ChartRegistryEntry;
  globalStyleFields?: ChartRegistryField[];
  prefill?: ChartPanelPrefill | null;
  projectId?: string;
  onInsertToPaper: (imageUrl: string, caption: string, replay?: PlotInsertReplay) => void;
}

/** DPI 选项的人话标签 */
const DPI_LABELS: Record<string, string> = {
  "300": "300 dpi（标准）",
  "600": "600 dpi（高清 · Nature 推荐）",
  "1200": "1200 dpi（超高清）",
};

/** 预设的人话标签 */
const PRESET_LABELS: Record<string, string> = {
  nature: "Nature 风格（紧凑 · 600dpi）",
  agr_journal: "农业期刊风格（宽图 · 网格）",
  slide: "汇报 PPT 风格（大字号）",
};

function presetOptionLabel(value: string): string {
  return PRESET_LABELS[value] ?? value;
}

function dpiOptionLabel(value: string): string {
  return DPI_LABELS[value] ?? `${value} dpi`;
}

function paletteOptionLabel(value: string): string {
  if (value === "") return "跟随预设";
  const labels: Record<string, string> = {
    nature: "Nature 学术色",
    agr: "农学经典色",
    pastel: "柔和色",
  };
  return labels[value] ?? value;
}

export function ChartWorkspace({
  registryEntry,
  globalStyleFields,
  prefill,
  projectId,
  onInsertToPaper,
}: ChartWorkspaceProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const panel = useChartPanel(registryEntry, globalStyleFields, prefill, projectId);
  const {
    inputMode,
    setInputMode,
    file,
    pasteText,
    updatePasteText,
    loading,
    generateStage,
    fieldValues,
    result,
    chartType,
    setChartType,
    parsedData,
    parseDataHint,
    canGenerate,
    onFieldChange,
    loadExample,
    saveStylePreset,
    hasExample,
    handleFile,
    handleGenerate,
    downloadUrl,
    fileIsSpreadsheet,
    basicLabelFields,
    extraBasicFields,
    visibleStyleFields,
    advancedStyleFields,
    chartSpecificStyleFields,
    title,
    idToType,
  } = panel;

  const handleInsertToPaper = (imageUrl: string, caption: string) => {
    const stylePayload: Record<string, unknown> = {};
    for (const f of (globalStyleFields ?? [])) {
      const v = fieldValues[f.key];
      if (v !== undefined && v !== "") {
        stylePayload[f.key] = v;
      }
    }
    const replayParsedData = parsedData
      ? {
          labels: parsedData.labels,
          datasets: parsedData.datasets.map((d) => ({
            label: d.label,
            data: d.data,
          })),
          ...(parsedData.forest ? { forest: parsedData.forest } : {}),
        }
      : null;
    const spec = buildChartReplayFigureSpec({
      caption,
      chartType,
      title: title || caption,
      xLabel: String(fieldValues.x_label ?? ""),
      yLabel: String(fieldValues.y_label ?? ""),
      style: Object.keys(stylePayload).length > 0 ? stylePayload : undefined,
      parsedData: replayParsedData,
    });
    const replay: PlotInsertReplay | undefined =
      spec || result?.svgUrl || result?.pdfUrl
        ? {
            ...(spec ? { figureSpecEnc: encodeChartAssetReplay(spec) } : {}),
            svgUrl: result?.svgUrl,
            pdfUrl: result?.pdfUrl,
          }
        : undefined;
    onInsertToPaper(imageUrl, caption, replay);
  };

  return (
    <div className="flex h-full min-h-0 w-full bg-[#faf9f6]">
      <section className="flex h-full w-[420px] max-w-[38%] min-w-[300px] shrink-0 flex-col border-r border-[#1a5632]/10 bg-white">
        <div className="shrink-0 border-b border-[#1a5632]/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#122820]">
            {registryEntry?.name ?? "数据图表"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6b7c72]">
            {registryEntry?.description ?? "粘贴表格数据，设置标注与期刊样式"}
          </p>
        </div>

        <Tabs defaultValue="data" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-2">
                <TabsTrigger value="data" className="text-xs gap-1">
                  <Table2 className="h-3 w-3" /> 数据
                </TabsTrigger>
                <TabsTrigger value="style" className="text-xs gap-1">
                  <Palette className="h-3 w-3" /> 样式
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="min-h-0 flex-1">
                <TabsContent value="data" className="space-y-4 px-4 pb-5 pt-2">
                  {!registryEntry && (
                    <div>
                      <Label className="text-xs">图表类型</Label>
                      <Select value={chartType} onValueChange={(v) => v && setChartType(v)}>
                        <SelectTrigger className="mt-1 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(idToType).map(([id, type]) => (
                            <SelectItem key={id} value={type} className="text-xs">
                              {id.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex gap-1 rounded-lg bg-[#1a5632]/6 p-0.5">
                    <Button
                      variant={inputMode === "paste" ? "default" : "ghost"}
                      size="sm"
                      className={`h-8 flex-1 text-xs ${inputMode === "paste" ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
                      onClick={() => setInputMode("paste")}
                    >
                      <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />粘贴数据
                    </Button>
                    <Button
                      variant={inputMode === "file" ? "default" : "ghost"}
                      size="sm"
                      className={`h-8 flex-1 text-xs ${inputMode === "file" ? "bg-[#1a5632] hover:bg-[#144228]" : ""}`}
                      onClick={() => setInputMode("file")}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />上传文件
                    </Button>
                  </div>

                  {inputMode === "paste" ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <Label className="text-xs text-[#6b7c72]">
                          CSV / TSV，首行为列名
                        </Label>
                        {hasExample && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 gap-1 text-[11px]"
                            onClick={loadExample}
                          >
                            <Sparkles className="h-3 w-3" />
                            加载示例
                          </Button>
                        )}
                      </div>
                      <Textarea
                        className="min-h-[160px] font-mono text-xs leading-relaxed"
                        value={pasteText}
                        onChange={(e) => {
                          updatePasteText(e.target.value);
                          if (!fieldValues.title && registryEntry) {
                            onFieldChange("title", registryEntry.name);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-[#6b7c72]">CSV / XLSX / TXT</Label>
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls,.txt,.tsv"
                        onChange={handleFile}
                        className="mt-1.5 h-9 text-xs"
                      />
                      {file && (
                        <p className="mt-1.5 truncate text-[11px] text-[#6b7c72]">{file.name}</p>
                      )}
                      {fileIsSpreadsheet && (
                        <p className="mt-2 text-[11px] leading-relaxed text-[#6b7c72]">
                          Excel 文件将在服务端解析，预览不可用；生成前请确认列名与数值格式正确。
                        </p>
                      )}
                    </div>
                  )}

                  {parseDataHint && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                      {parseDataHint}
                    </p>
                  )}

                  {parsedData && (
                    <div className="rounded-lg border border-[#1a5632]/10 bg-[#faf9f6] p-3">
                      <p className="mb-2 text-[11px] font-medium text-[#6b7c72]">
                        数据预览 · {parsedData.labels.length} 行
                        {parsedData.forest
                          ? " · 森林图"
                          : ` · ${parsedData.datasets.length} 组`}
                      </p>
                      <div className="max-h-40 overflow-auto rounded-md border border-[#1a5632]/8 bg-white">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-[#f4f6f4]">
                            <tr>
                              {parsedData.columns.map((c, i) => (
                                <th key={i} className="px-3 py-1.5 text-left font-medium">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {parsedData.labels.map((label, ri) => (
                              <tr key={ri} className="border-t border-[#1a5632]/5">
                                <td className="px-3 py-1 font-mono">{label}</td>
                                {parsedData.forest ? (
                                  <>
                                    <td className="px-3 py-1 text-right font-mono">
                                      {parsedData.forest.estimates[ri]?.toFixed(3) ?? ""}
                                    </td>
                                    <td className="px-3 py-1 text-right font-mono">
                                      {parsedData.forest.ci_low[ri]?.toFixed(3) ?? ""}
                                    </td>
                                    <td className="px-3 py-1 text-right font-mono">
                                      {parsedData.forest.ci_high[ri]?.toFixed(3) ?? ""}
                                    </td>
                                  </>
                                ) : (
                                  parsedData.datasets.map((ds, di) => (
                                    <td key={di} className="px-3 py-1 text-right font-mono">
                                      {ds.data[ri]?.toFixed(2) ?? ""}
                                    </td>
                                  ))
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="style" className="space-y-4 px-4 pb-5 pt-2">
                  {projectId && projectId !== "default" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={saveStylePreset}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      保存为本项目默认样式
                    </Button>
                  )}

                  {/* ====== 标题与轴标签 ====== */}
                  <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                      标题与轴标签
                    </p>
                    <ChartFieldForm
                      fields={basicLabelFields}
                      values={fieldValues}
                      onChange={onFieldChange}
                      compact
                    />
                    {extraBasicFields.length > 0 && (
                      <div className="mt-2">
                        <ChartFieldForm
                          fields={extraBasicFields}
                          values={fieldValues}
                          onChange={onFieldChange}
                          compact
                        />
                      </div>
                    )}
                    {parsedData && !fieldValues.x_label && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => onFieldChange("x_label", parsedData.columns[0] || "")}
                      >
                        用首列「{parsedData.columns[0]}」作为 X 轴标签
                      </Button>
                    )}
                  </section>

                  {/* ====== 期刊风格（常用） ====== */}
                  {visibleStyleFields.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        期刊风格
                      </p>
                      <div className="space-y-2">
                        {visibleStyleFields.map((field) => {
                          const val = fieldValues[field.key];
                          if (field.type === "select" && field.options) {
                            return (
                              <div key={field.key}>
                                <Label className="text-[10px]">{field.label}</Label>
                                <Select
                                  value={String(val ?? field.default ?? "")}
                                  onValueChange={(v) => { if (v) onFieldChange(field.key, v); }}
                                >
                                  <SelectTrigger className="mt-0.5 h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {field.options.map((opt) => (
                                      <SelectItem key={opt} value={opt} className="text-xs">
                                        {field.key === "preset"
                                          ? presetOptionLabel(opt)
                                          : field.key === "dpi"
                                            ? dpiOptionLabel(opt)
                                            : field.key === "export_formats"
                                              ? opt
                                              : opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </section>
                  )}

                  {/* ====== 本图专属选项 ====== */}
                  {chartSpecificStyleFields.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        本图专属
                      </p>
                      <ChartFieldForm
                        fields={chartSpecificStyleFields}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
                    </section>
                  )}

                  {/* ====== 更多设置（可折叠） ====== */}
                  {advancedStyleFields.length > 0 && (
                    <section>
                      <button
                        type="button"
                        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72] hover:text-[#1a5632] transition-colors"
                        onClick={() => setAdvancedOpen((v) => !v)}
                      >
                        {advancedOpen ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        更多设置
                      </button>
                      {advancedOpen && (
                        <div className="mt-2 space-y-2">
                          {advancedStyleFields.map((field) => {
                            const val = fieldValues[field.key];
                            if (field.type === "select" && field.options) {
                              return (
                                <div key={field.key}>
                                  <Label className="text-[10px]">{field.label}</Label>
                                  <Select
                                    value={String(val ?? field.default ?? "")}
                                    onValueChange={(v) => { if (v) onFieldChange(field.key, v); }}
                                  >
                                    <SelectTrigger className="mt-0.5 h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options.map((opt) => (
                                        <SelectItem key={opt} value={opt} className="text-xs">
                                          {field.key === "palette" ? paletteOptionLabel(opt) : opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            }
                            if (field.type === "boolean") {
                              const checked = val === true || val === "true";
                              return (
                                <div key={field.key} className="flex items-center justify-between rounded border px-2 py-1.5">
                                  <Label className="text-[10px]">{field.label}</Label>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => onFieldChange(field.key, e.target.checked)}
                                    className="h-3.5 w-3.5"
                                  />
                                </div>
                              );
                            }
                            if (field.type === "number") {
                              return (
                                <div key={field.key}>
                                  <Label className="text-[10px]">{field.label}</Label>
                                  <Input
                                    type="number"
                                    className="mt-0.5 h-7 text-xs"
                                    min={field.min}
                                    max={field.max}
                                    step={field.step ?? 1}
                                    value={String(val ?? field.default ?? "")}
                                    onChange={(e) =>
                                      onFieldChange(field.key, e.target.value === "" ? "" : Number(e.target.value))
                                    }
                                  />
                                </div>
                              );
                            }
                            return (
                              <div key={field.key}>
                                <Label className="text-[10px]">{field.label}</Label>
                                <Input
                                  className="mt-0.5 h-7 text-xs"
                                  value={String(val ?? field.default ?? "")}
                                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </TabsContent>
            </ScrollArea>
          </Tabs>
      </section>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChartPreviewPane
          loading={loading}
          loadingMessage={generateStage}
          canGenerate={canGenerate}
          result={result}
          title={title}
          onGenerate={handleGenerate}
          onInsert={handleInsertToPaper}
          onDownload={downloadUrl}
        />
      </section>
    </div>
  );
}
