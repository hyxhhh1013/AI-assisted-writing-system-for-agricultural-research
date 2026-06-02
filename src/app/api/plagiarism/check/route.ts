import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { validateBody } from "@/lib/api-validate";
import { plagiarismCheckSchema } from "@/lib/validations";
import { runPlagiarismCheck } from "@/services/plagiarism-service";
import { getErrorMessage } from "@/lib/error-utils";

export const maxDuration = 180;

const log = createLogger("api/plagiarism/check");

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(plagiarismCheckSchema, await req.json());
    if (ve) return ve;

    const { projectId, title, content } = data;

    // 检查是否需要 SSE 进度推送
    const accept = req.headers.get("accept") || "";
    const wantsSSE = accept.includes("text/event-stream");

    if (wantsSSE) {
      // SSE 模式：分阶段推送进度
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            const result = await runPlagiarismCheck(
              { projectId, title, content, webSearch: false },
              (event) => {
                send({ type: "progress", stage: event.stage, message: event.message });
              }
            );
            send({ type: "done", data: result });
          } catch (err) {
            log.fail("SSE plagiarism check failed", err, { projectId });
            send({ type: "error", message: err instanceof Error ? getErrorMessage(err) : "查重检测失败" });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 普通模式：直接返回结果
    const result = await runPlagiarismCheck({ projectId, title, content, webSearch: false });
    return Response.json(result);
  } catch (error: unknown) {
    log.fail("plagiarism check failed", error);
    const message = error instanceof Error ? getErrorMessage(error) : "查重检测失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
