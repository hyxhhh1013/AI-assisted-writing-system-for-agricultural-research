/** 解析 Route Handler 返回的 SSE 文本为 JSON 事件列表 */
export async function parseSseJsonEvents(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  const events: Record<string, unknown>[] = [];
  for (const block of text.split("\n\n")) {
    const line = block.trim();
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    events.push(JSON.parse(payload) as Record<string, unknown>);
  }
  return events;
}
