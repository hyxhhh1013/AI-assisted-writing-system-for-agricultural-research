import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getRecentLogs, getUsageStats } from "@/services/admin-usage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const stats = await getUsageStats();
  const recent = await getRecentLogs(100);

  const sortedStats = Object.entries(stats)
    .sort(([, a], [, b]) => b - a)
    .map(([feature, count]) => ({ feature, count }));

  return NextResponse.json({
    success: true,
    stats: sortedStats,
    recent,
    totalEntries: Object.values(stats).reduce((sum, c) => sum + c, 0),
  });
}
