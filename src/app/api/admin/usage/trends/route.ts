import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getUsageTrends } from "@/services/admin-usage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const rangeParam = new URL(req.url).searchParams.get("range");
  const range = rangeParam === "12w" ? "12w" : "30d";
  const trends = await getUsageTrends(range);

  return NextResponse.json({ success: true, ...trends });
}
