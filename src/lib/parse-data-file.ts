/** 客户端解析 CSV / Excel 为 JSON 摘要（供 AI 分析用） */

export async function parseDataFileToSummary(file: File): Promise<{
  fileName: string;
  dataSummary: string;
  rawFile: ArrayBuffer;
}> {
  const fileName = file.name;

  if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let text: string;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      text = new TextDecoder("utf-8").decode(bytes);
    } else {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder("gbk").decode(bytes);
      }
    }
    const Papa = await import("papaparse");
    const results = Papa.default.parse<Record<string, string>>(text, { header: true });
    const dataSummary = JSON.stringify((results.data as Record<string, string>[]).slice(0, 15), null, 2);
    return { fileName, dataSummary, rawFile: buf };
  }

  if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(new Uint8Array(buf), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
    const dataSummary = JSON.stringify(jsonData.slice(0, 15), null, 2);
    return { fileName, dataSummary, rawFile: buf };
  }

  throw new Error("不支持的文件格式，请上传 CSV 或 Excel");
}
