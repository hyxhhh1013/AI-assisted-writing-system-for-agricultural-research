import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getErrorMessage } from "@/lib/error-utils";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";

/**
 * GET /api/figures/registry
 * 返回统一图形注册表，前端据此动态渲染所有图形类型
 */
export async function GET(req: NextRequest) {
  if (!getUserIdFromRequest(req)) return unauthorizedResponse();

  try {
    const registryPath = path.join(process.cwd(), "scripts", "charts", "registry.json");
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json({ error: "注册表不存在" }, { status: 500 });
    }
    const raw = fs.readFileSync(registryPath, "utf-8");
    const registry = JSON.parse(raw);
    return NextResponse.json(registry);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
