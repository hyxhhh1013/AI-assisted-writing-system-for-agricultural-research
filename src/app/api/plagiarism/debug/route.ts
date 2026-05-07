import { callAI } from "@/lib/ai";

export async function GET() {
  try {
    const res = await callAI({
      provider: "deepseek",
      messages: [
        { role: "system", content: "只输出JSON，不要其他文字：{\"test\": true, \"model\": \"ok\"}" },
        { role: "user", content: "测试" },
      ],
      stream: false,
    });
    const raw = await res.text();
    return Response.json({ ok: res.ok, status: res.status, raw: raw.slice(0, 500) });
  } catch (e: any) {
    return Response.json({ error: e.message, stack: e.stack?.slice(0, 300) });
  }
}
