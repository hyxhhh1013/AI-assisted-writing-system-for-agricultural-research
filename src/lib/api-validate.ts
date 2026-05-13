import { ZodSchema, ZodError } from "zod";
import { errorResponse } from "./api-response";

export async function validateBody<T>(schema: ZodSchema<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const formatted = formatZodErrors(result.error);
    return { data: null, errorResponse: errorResponse("请求参数校验失败", 400, formatted) } as const;
  }
  return { data: result.data, errorResponse: null } as const;
}

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const acc: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue.message);
  }
  return acc;
}
