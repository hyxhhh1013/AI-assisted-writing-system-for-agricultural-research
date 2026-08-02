/** 图片 → 文本。Task 7 前为占位：直接失败（视觉 provider 未接）。 */
export async function describeImage(
  _filePath: string,
): Promise<{ status: "ready" | "extract_failed"; text?: string; truncated?: boolean; source: "image_vision" | "image_ocr"; error?: string }> {
  return { status: "extract_failed", source: "image_ocr", error: "视觉模型未配置" };
}
