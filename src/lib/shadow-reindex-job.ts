export function shadowReindexRefusal(input: {
  category: string;
  fileCount: number;
  alreadyRunning?: boolean;
}): { status: number; error: string } | null {
  if (input.alreadyRunning) {
    return { status: 409, error: "已有影子重建在跑，请等这一分类结束。" };
  }
  if (!input.category.trim()) {
    return { status: 400, error: "请先选择一个分类。" };
  }
  if (input.fileCount < 1) {
    return { status: 400, error: "这个分类下没有 PDF。" };
  }
  return null;
}
