import { ZodSchema, ZodError } from "zod";
import { errorResponse } from "./api-response";
import { jsonObjectSchema } from "./validations";

export async function validateBody<T>(schema: ZodSchema<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const formatted = formatZodErrors(result.error);
    return { data: null, errorResponse: errorResponse("请求参数校验失败", 400, formatted) } as const;
  }
  return { data: result.data, errorResponse: null } as const;
}

/** 解析 FormData 中的可选 JSON config 字段 */
export function parseOptionalJsonConfig(configStr: string | null) {
  if (!configStr) {
    return { data: {} as Record<string, unknown>, errorResponse: null } as const;
  }
  try {
    const parsed: unknown = JSON.parse(configStr);
    const result = jsonObjectSchema.safeParse(parsed);
    if (!result.success) {
      return {
        data: null,
        errorResponse: errorResponse("配置格式错误", 400, formatZodErrors(result.error)),
      } as const;
    }
    return { data: result.data, errorResponse: null } as const;
  } catch {
    return { data: null, errorResponse: errorResponse("配置格式错误", 400) } as const;
  }
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
