import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import { getIllustrationAdminStatus } from "@/lib/illustration-keys";

export const dynamic = "force-dynamic";

/** GET /api/admin/illustration-status — 即梦 / 智谱绘图 Key 与模型（不含明文） */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const data = await getIllustrationAdminStatus();
  return success(data);
}
