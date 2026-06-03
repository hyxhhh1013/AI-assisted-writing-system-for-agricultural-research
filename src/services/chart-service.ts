/**
 * 图表服务 — 对接后端 Python 绘图脚本
 * 移除了前端 ECharts 依赖，所有图表由 Python (matplotlib/PyXplore) 生成
 */

export interface ChartRequest {
  dataFile: File;
  mode: "generic" | "crd";
  config: Record<string, unknown>;
}

export interface ChartResponse {
  imageBase64: string;
  fileName: string;
}

/**
 * 调用后端 API 生成图表
 */
export async function generateChart(req: ChartRequest): Promise<ChartResponse> {
  const formData = new FormData();
  formData.append("dataFile", req.dataFile);
  formData.append("config", JSON.stringify(req.config));
  formData.append("mode", req.mode);

  const res = await fetch("/api/chart", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "图表生成失败");
  }

  return res.json();
}

/**
 * 将 base64 图片转换为 Markdown 图片标记
 */
export function imageToMarkdown(base64: string, caption: string): string {
  return `\n\n![${caption}](${base64})\n\n*${caption}*\n\n`;
}

/**
 * 将 base64 图片转换为 HTML img 标签（用于 PDF 导出）
 */
export function imageToHtml(base64: string, caption: string): string {
  return `<figure style="text-align:center;margin:20px 0;">
  <img src="${base64}" alt="${caption}" style="max-width:100%;height:auto;" />
  <figcaption style="font-size:0.9em;color:#666;margin-top:8px;">${caption}</figcaption>
</figure>`;
}
