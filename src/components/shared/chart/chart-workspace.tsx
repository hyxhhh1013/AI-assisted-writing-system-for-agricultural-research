"use client";

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
  ClipboardPaste, Upload, Table2, Type, Palette, Sparkles, BookmarkPlus,
} from "lucide-react";
import type { ChartPanelPrefill } from "@/contracts/figure";
import { ChartFieldForm } from "@/components/shared/chart/chart-field-form";
import { ChartPreviewPane } from "@/components/shared/chart/chart-preview-pane";
import { useChartPanel, type ChartRegistryEntry } from "@/hooks/use-chart-panel";
import type { ChartRegistryField } from "@/contracts/chart-style";

interface ChartWorkspaceProps {
  registryEntry?: ChartRegistryEntry;
  globalStyleFields?: ChartRegistryField[];
  prefill?: ChartPanelPrefill | null;
  projectId?: string;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

export function ChartWorkspace({
  registryEntry,
  globalStyleFields,
  prefill,
  projectId,
  onInsertToPaper,
}: ChartWorkspaceProps) {
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
    styleGroups,
    title,
    idToType,
  } = panel;

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
              <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-3">
                <TabsTrigger value="data" className="text-xs gap-1">
                  <Table2 className="h-3 w-3" /> 数据
                </TabsTrigger>
                <TabsTrigger value="labels" className="text-xs gap-1">
                  <Type className="h-3 w-3" /> 标注
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

                <TabsContent value="labels" className="space-y-4 px-4 pb-5 pt-2">
                  <ChartFieldForm
                    fields={basicLabelFields}
                    values={fieldValues}
                    onChange={onFieldChange}
                    compact
                  />
                  {extraBasicFields.length > 0 && (
                    <ChartFieldForm
                      fields={extraBasicFields}
                      values={fieldValues}
                      onChange={onFieldChange}
                      compact
                    />
                  )}
                  {parsedData && !fieldValues.x_label && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => onFieldChange("x_label", parsedData.columns[0] || "")}
                    >
                      用首列「{parsedData.columns[0]}」作为 X 轴标签
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="style" className="space-y-5 px-4 pb-5 pt-2">
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
                  {styleGroups.preset.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        期刊预设
                      </p>
                      <ChartFieldForm
                        fields={styleGroups.preset}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
                    </section>
                  )}
                  {styleGroups.size.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        尺寸与字号
                      </p>
                      <ChartFieldForm
                        fields={styleGroups.size}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
                    </section>
                  )}
                  {styleGroups.legend.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        图例与子图
                      </p>
                      <ChartFieldForm
                        fields={styleGroups.legend}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
                    </section>
                  )}
                  {styleGroups.toggles.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        显示选项
                      </p>
                      <ChartFieldForm
                        fields={styleGroups.toggles}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
                    </section>
                  )}
                  {styleGroups.advanced.length > 0 && (
                    <section>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#6b7c72]">
                        轴与刻度
                      </p>
                      <ChartFieldForm
                        fields={styleGroups.advanced}
                        values={fieldValues}
                        onChange={onFieldChange}
                        compact
                      />
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
          onInsert={onInsertToPaper}
          onDownload={downloadUrl}
        />
      </section>
    </div>
  );
}
