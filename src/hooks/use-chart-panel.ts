"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
import {
  postChartForm,
  type ChartGenericFileConfig,
  type ChartPasteInlineConfig,
} from "@/services/charts";
import type { ChartRegistryField } from "@/contracts/chart-style";
import type { ChartPanelPrefill } from "@/contracts/figure";
import { buildChartStylePayload, defaultStyleFieldValues } from "@/contracts/chart-style";

export interface ChartRegistryEntry {
  id: string;
  name: string;
  description: string;
  example?: string;
  config_fields?: ChartRegistryField[];
}

const ID_TO_TYPE: Record<string, string> = {
  bar_grouped: "bar",
  bar_stacked: "stacked_bar",
  bar_pct_stacked: "pct_stacked",
  line: "line",
  scatter: "scatter",
  pie: "pie",
  heatmap: "heatmap",
  area: "area",
  forest: "forest",
  radar: "radar",
};

const ERROR_SUFFIXES = ["_sd", "_sem", "_se", "_err", "_std", "_ci"];
const STYLE_STORAGE_PREFIX = "grainscript:plot-style:";

export interface ParsedChartData {
  labels: string[];
  datasets: { label: string; data: number[]; errors?: number[] }[];
  columns: string[];
  forest?: { estimates: number[]; ci_low: number[]; ci_high: number[] };
}

function parseForestTabular(text: string): ParsedChartData | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const firstLine = lines[0];
  let sep = ",";
  if (firstLine.includes("\t")) sep = "\t";
  else if (firstLine.includes(";")) sep = ";";
  else if (firstLine.includes("，")) sep = "，";

  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  if (headers.length < 4) return null;

  const labels: string[] = [];
  const estimates: number[] = [];
  const ci_low: number[] = [];
  const ci_high: number[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 4) continue;
    labels.push(parts[0]);
    const est = parseFloat(parts[1]);
    const lo = parseFloat(parts[2]);
    const hi = parseFloat(parts[3]);
    if (Number.isNaN(est) || Number.isNaN(lo) || Number.isNaN(hi)) continue;
    estimates.push(est);
    ci_low.push(lo);
    ci_high.push(hi);
  }

  if (labels.length === 0) return null;

  return {
    labels,
    datasets: [],
    columns: headers,
    forest: { estimates, ci_low, ci_high },
  };
}

export function parseTabularData(text: string, chartId?: string): ParsedChartData | null {
  if (chartId === "forest") {
    return parseForestTabular(text);
  }

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const firstLine = lines[0];
  let sep = ",";
  if (firstLine.includes("\t")) sep = "\t";
  else if (firstLine.includes(";")) sep = ";";
  else if (firstLine.includes("，")) sep = "，";

  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const dataLines = lines.slice(1).filter((l) => l.trim());

  const labels: string[] = [];
  const valueColIndices: number[] = [];
  const errorMap = new Map<number, number>();

  for (let ci = 1; ci < headers.length; ci++) {
    const h = headers[ci];
    const errSuffix = ERROR_SUFFIXES.find((s) => h.toLowerCase().endsWith(s));
    if (errSuffix) {
      const base = h.slice(0, -errSuffix.length);
      const baseIdx = headers.findIndex((x, i) => i > 0 && i !== ci && x === base);
      if (baseIdx > 0) {
        errorMap.set(baseIdx, ci);
      }
      continue;
    }
    valueColIndices.push(ci);
  }

  const columns: number[][] = valueColIndices.map(() => []);
  const errorColumns: (number[] | undefined)[] = valueColIndices.map(() => undefined);

  for (const line of dataLines) {
    const parts = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    labels.push(parts[0]);
    valueColIndices.forEach((colIdx, vi) => {
      const v = parseFloat(parts[colIdx]);
      columns[vi].push(Number.isNaN(v) ? 0 : v);
      const errCol = errorMap.get(colIdx);
      if (errCol !== undefined) {
        if (!errorColumns[vi]) errorColumns[vi] = [];
        const e = parseFloat(parts[errCol]);
        errorColumns[vi]!.push(Number.isNaN(e) ? 0 : e);
      }
    });
  }

  if (labels.length === 0) return null;

  return {
    labels,
    datasets: valueColIndices.map((colIdx, i) => ({
      label: headers[colIdx],
      data: columns[i],
      ...(errorColumns[i] ? { errors: errorColumns[i] } : {}),
    })),
    columns: headers,
  };
}

/** 粘贴/预览文本无法解析时的可读提示（供 UI 与单测） */
export function getTabularParseHint(text: string, chartId?: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (parseTabularData(trimmed, chartId)) return null;

  const lines = trimmed.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return "至少需要一行列名和一行数据。";
  }

  if (chartId === "forest") {
    const firstLine = lines[0];
    let sep = ",";
    if (firstLine.includes("\t")) sep = "\t";
    else if (firstLine.includes(";")) sep = ";";
    else if (firstLine.includes("，")) sep = "，";
    const colCount = firstLine.split(sep).filter((c) => c.trim()).length;
    if (colCount < 4) {
      return "森林图需要 4 列：名称、效应值、置信区间下限、上限。";
    }
  }

  return "未能解析出有效数值列，请检查分隔符（逗号 / Tab / 分号）与数字格式。";
}

function readStylePreset(
  projectId: string,
  styleFields: ChartRegistryField[],
): Record<string, string | number | boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STYLE_STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const allowed = new Set(styleFields.map((f) => f.key));
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!allowed.has(key)) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        result[key] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function writeStylePreset(
  projectId: string,
  fieldValues: Record<string, string | number | boolean>,
  styleFields: ChartRegistryField[],
): void {
  if (typeof window === "undefined") return;
  const allowed = new Set(styleFields.map((f) => f.key));
  const payload: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (allowed.has(key)) payload[key] = value;
  }
  window.localStorage.setItem(`${STYLE_STORAGE_PREFIX}${projectId}`, JSON.stringify(payload));
}

function initFieldValues(
  basicFields: ChartRegistryField[] | undefined,
  styleFields: ChartRegistryField[] | undefined,
): Record<string, string | number | boolean> {
  return {
    ...defaultStyleFieldValues(styleFields),
    ...defaultStyleFieldValues(basicFields),
    title: "",
    x_label: "",
    y_label: "",
  };
}

export interface ChartPanelResult {
  imageBase64: string;
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  caption: string;
}

export function useChartPanel(
  registryEntry: ChartRegistryEntry | undefined,
  globalStyleFields: ChartRegistryField[] | undefined,
  prefill?: ChartPanelPrefill | null,
  projectId?: string,
) {
  const registryId = registryEntry?.id;
  const registryName = registryEntry?.name;
  const registryExample = registryEntry?.example;
  const basicFields = registryEntry?.config_fields;
  const styleFields = useMemo(() => globalStyleFields ?? [], [globalStyleFields]);
  const resolvedType = registryId ? (ID_TO_TYPE[registryId] || registryId) : "bar";
  const chartName = registryName || "图表";

  const [inputMode, setInputMode] = useState<"file" | "paste">("paste");
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewText, setFilePreviewText] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState(registryEntry?.example || "");
  const [loading, setLoading] = useState(false);
  const [generateStage, setGenerateStage] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>(() =>
    initFieldValues(basicFields, styleFields),
  );
  const [result, setResult] = useState<ChartPanelResult | null>(null);
  const [chartType, setChartType] = useState(resolvedType);

  useEffect(() => {
    if (prefill) {
      setPasteText(prefill.pasteText);
      const initVals = initFieldValues(basicFields, styleFields);
      // 恢复保存时的样式配置
      const savedStyle: Record<string, string | number | boolean> = {};
      if (prefill.style && typeof prefill.style === "object") {
        for (const [k, v] of Object.entries(prefill.style)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            savedStyle[k] = v;
          }
        }
      }
      setFieldValues({
        ...initVals,
        ...savedStyle,
        ...(prefill.title !== undefined ? { title: prefill.title } : {}),
        ...(prefill.xLabel !== undefined ? { x_label: prefill.xLabel } : {}),
        ...(prefill.yLabel !== undefined ? { y_label: prefill.yLabel } : {}),
      });
      setInputMode("paste");
      setResult(null);
      setFile(null);
      if (prefill.figureId && ID_TO_TYPE[prefill.figureId]) {
        setChartType(ID_TO_TYPE[prefill.figureId]);
      }
      return;
    }
    setPasteText(registryExample || "");
    setFieldValues(initFieldValues(basicFields, styleFields));
    setResult(null);
    setFile(null);
    setChartType(resolvedType);
  }, [prefill, registryExample, basicFields, styleFields, resolvedType]);

  useEffect(() => {
    if (prefill) return;
    if (!projectId || projectId === "default" || styleFields.length === 0) return;
    const saved = readStylePreset(projectId, styleFields);
    if (!saved) return;
    setFieldValues((prev) => ({ ...prev, ...saved }));
  }, [projectId, styleFields, prefill]);

  useEffect(() => {
    if (inputMode !== "file" || !file) {
      setFilePreviewText(null);
      return;
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setFilePreviewText(null);
      return;
    }
    let cancelled = false;
    void file.text().then((text) => {
      if (!cancelled) setFilePreviewText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [file, inputMode]);

  const updatePasteText = useCallback((text: string) => {
    setPasteText(text);
    setResult(null);
  }, []);

  const title = String(fieldValues.title ?? "");
  const xLabel = String(fieldValues.x_label ?? "");
  const yLabel = String(fieldValues.y_label ?? "");

  const activePreviewText =
    inputMode === "paste" ? pasteText : filePreviewText ?? "";

  const parsedData = useMemo(() => {
    if (activePreviewText.trim()) {
      return parseTabularData(activePreviewText, registryId);
    }
    return null;
  }, [activePreviewText, registryId]);

  const parseDataHint = useMemo(() => {
    if (inputMode === "file" && file && !filePreviewText) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        return null;
      }
      return null;
    }
    if (!activePreviewText.trim()) return null;
    return getTabularParseHint(activePreviewText, registryId);
  }, [activePreviewText, registryId, inputMode, file, filePreviewText]);

  const stylePayload = useMemo(() => {
    const styleKeys = new Set(styleFields.map((f) => f.key));
    // 图表专属样式字段 (如 show_values, bar_edge) 也需要打进 style payload
    const chartStyleKeys = new Set(
      (basicFields ?? []).filter(f => f.group === "chart_specific").map(f => f.key),
    );
    const styleValues: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(fieldValues)) {
      if (styleKeys.has(k) || chartStyleKeys.has(k)) styleValues[k] = v;
    }
    return buildChartStylePayload(styleValues);
  }, [fieldValues, styleFields, basicFields]);

  const canGenerate =
    (inputMode === "file" && !!file) ||
    (inputMode === "paste" && !!parsedData && (parsedData.datasets.length > 0 || !!parsedData.forest));

  const onFieldChange = useCallback((key: string, value: string | number | boolean) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }, []);

  const loadExample = useCallback(() => {
    if (!registryExample) {
      toast.error("该图表类型暂无示例数据");
      return;
    }
    setInputMode("paste");
    setFile(null);
    setFilePreviewText(null);
    setPasteText(registryExample);
    setResult(null);
    if (!String(fieldValues.title ?? "").trim()) {
      onFieldChange("title", chartName);
    }
    toast.success("已加载示例数据");
  }, [registryExample, chartName, fieldValues.title, onFieldChange]);

  const saveStylePreset = useCallback(() => {
    if (!projectId || projectId === "default") {
      toast.error("请从项目进入作图页后再保存样式");
      return;
    }
    writeStylePreset(projectId, fieldValues, styleFields);
    toast.success("已保存为本项目默认图表样式");
  }, [projectId, fieldValues, styleFields]);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setFilePreviewText(null);
      setResult(null);
      if (!fieldValues.title) {
        onFieldChange("title", f.name.replace(/\.[^.]+$/, ""));
      }
    },
    [fieldValues.title, onFieldChange],
  );

  const buildConfig = useCallback((): ChartGenericFileConfig | ChartPasteInlineConfig => {
    const styleKeys = new Set(styleFields.map((f) => f.key));
    const chartStyleKeys = new Set(
      (basicFields ?? []).filter(f => f.group === "chart_specific").map(f => f.key),
    );
    const basicKeys = new Set((basicFields ?? []).map((f) => f.key));
    const chartExtras: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(fieldValues)) {
      // chart_specific 字段已合并进 style payload，不再作为顶层 config 发送
      if (chartStyleKeys.has(k)) continue;
      if (basicKeys.has(k) && !["title", "x_label", "y_label"].includes(k)) {
        chartExtras[k] = v;
      }
      if (!styleKeys.has(k) && !basicKeys.has(k) && k !== "title" && k !== "x_label" && k !== "y_label") {
        chartExtras[k] = v;
      }
    }

    const base = {
      title: title || chartName,
      chart_type: chartType,
      x_label: xLabel,
      y_label: yLabel,
      style: stylePayload,
      y_sci_notation: stylePayload.y_sci_notation ? true : undefined,
      x_tick_rotation: stylePayload.x_tick_rotation,
      ...chartExtras,
    };

    if (stylePayload.y_sci_notation) {
      base.y_sci_notation = true;
    }
    if (stylePayload.x_tick_rotation !== undefined) {
      base.x_tick_rotation = stylePayload.x_tick_rotation;
    }

    if (inputMode === "paste" && parsedData) {
      const payload: ChartPasteInlineConfig = {
        ...base,
        data: { labels: parsedData.labels, datasets: parsedData.datasets },
        x_label: xLabel || parsedData.columns[0] || "",
      };
      if (parsedData.forest) {
        payload.forest = {
          labels: parsedData.labels,
          estimates: parsedData.forest.estimates,
          ci_low: parsedData.forest.ci_low,
          ci_high: parsedData.forest.ci_high,
        };
      }
      return payload;
    }
    return base;
  }, [
    title, chartName, chartType, xLabel, yLabel, stylePayload, styleFields,
    basicFields, fieldValues, inputMode, parsedData,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) {
      toast.error("请先粘贴或上传有效数据");
      return;
    }
    setLoading(true);
    setGenerateStage("正在提交数据…");
    try {
      const config = buildConfig();
      let body: FormData;

      if (inputMode === "file" && file) {
        body = new FormData();
        body.append("dataFile", file);
        body.append("mode", "generic");
        body.append("config", JSON.stringify(config));
      } else if (inputMode === "paste" && parsedData) {
        body = new FormData();
        body.append("mode", "generic");
        body.append("config", JSON.stringify(config));
        body.append("dataFile", new Blob([pasteText], { type: "text/csv" }), "data.csv");
      } else {
        toast.error("请上传文件或粘贴数据");
        return;
      }

      setGenerateStage("正在运行 Python 绘图…");
      const data = await postChartForm(body);
      setResult({
        imageBase64: data.imageBase64 ?? "",
        imageUrl: data.imageUrl ?? "",
        svgUrl: data.svgUrl,
        pdfUrl: data.pdfUrl,
        caption: title || chartName,
      });
      if (projectId && projectId !== "default") {
        writeStylePreset(projectId, fieldValues, styleFields);
      }
      toast.success("图表生成成功");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
      setGenerateStage(null);
    }
  }, [
    canGenerate,
    buildConfig,
    inputMode,
    file,
    parsedData,
    pasteText,
    title,
    chartName,
    projectId,
    fieldValues,
    styleFields,
  ]);

  const downloadUrl = useCallback((url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }, []);

  const basicLabelFields = (basicFields ?? []).filter((f) =>
    ["title", "x_label", "y_label"].includes(f.key),
  );
  const extraBasicFields = (basicFields ?? []).filter((f) =>
    !["title", "x_label", "y_label"].includes(f.key) && f.group !== "chart_specific",
  );
  const defaultLabelFields: ChartRegistryField[] = [
    { key: "title", label: "图表标题", type: "text" },
    { key: "x_label", label: "X 轴标签", type: "text" },
    { key: "y_label", label: "Y 轴标签", type: "text" },
  ];

  // 按 display 字段分层：visible（日常使用）vs advanced（折叠隐藏）
  const visibleStyleFields = styleFields.filter((f) => f.display === "visible" || !f.display);
  const advancedStyleFields = styleFields.filter((f) => f.display === "advanced");
  // 图表专属样式字段（如柱状图的 show_values, bar_edge）
  const chartSpecificStyleFields = (basicFields ?? []).filter((f) => f.group === "chart_specific");

  return {
    registryEntry,
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
    hasExample: Boolean(registryExample),
    handleFile,
    handleGenerate,
    downloadUrl,
    fileIsSpreadsheet:
      Boolean(file) &&
      (file?.name.toLowerCase().endsWith(".xlsx") || file?.name.toLowerCase().endsWith(".xls")),
    basicLabelFields: basicLabelFields.length ? basicLabelFields : defaultLabelFields,
    extraBasicFields,
    visibleStyleFields,
    advancedStyleFields,
    chartSpecificStyleFields,
    title,
    idToType: ID_TO_TYPE,
  };
}
