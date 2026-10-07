import { isDeepNightWindow } from "../../scripts/lib/reading-order-repair.mjs";

export function shadowReindexRefusal(input: {
  category: string;
  fileCount: number;
  now?: Date;
  alreadyRunning?: boolean;
}): { status: number; error: string } | null {
  if (input.alreadyRunning) {
    return { status: 409, error: "已有影子重建在跑，请等这一分类结束。" };
  }
  if (!input.category.trim()) {
    return { status: 400, error: "请先选择一个分类。" };
  }
  if (!isDeepNightWindow(input.now ?? new Date())) {
    return { status: 409, error: "不在深夜窗口 00:30–05:00（北京时间），未开始。线上索引未改。" };
  }
  if (input.fileCount < 1) {
    return { status: 400, error: "这个分类下没有 PDF。" };
  }
  return null;
}
