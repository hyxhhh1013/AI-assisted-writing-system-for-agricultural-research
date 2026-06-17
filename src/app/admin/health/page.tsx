"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Database, FileText, HardDrive, Server, AlertTriangle } from "lucide-react";
import { getAdminHealth, type AdminHealthData } from "@/services/admin";

export default function AdminHealthPage() {
  const [data, setData] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminHealth().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;
  if (!data) return <div className="text-sm text-red-600">加载失败</div>;

  const fmtBytes = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
  const uptimeStr = `${Math.floor(data.server.uptime / 3600)}h ${Math.floor((data.server.uptime % 3600) / 60)}m`;

  const alerts: { message: string; href: string; label: string }[] = [];
  if (!data.db.connected) {
    alerts.push({ message: "数据库连接异常", href: "/admin/settings", label: "检查配置" });
  }
  if (data.knowledge.uncategorizedCount > 0) {
    alerts.push({
      message: `${data.knowledge.uncategorizedCount} 篇文献未分类`,
      href: "/admin/knowledge?category=未分类",
      label: "去整理",
    });
  }
  if (data.index.indexFiles.length === 0) {
    alerts.push({
      message: "RAG 索引文件缺失，检索可能不可用",
      href: "/admin/knowledge",
      label: "重建索引",
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-[#122820]">系统健康</h2>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.message}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {alert.message}
              </div>
              <Link href={alert.href}>
                <Button variant="outline" size="sm" className="h-7 text-xs">{alert.label}</Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-[#1a5632]" />数据库</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-1">
              {data.db.connected ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
              <span className="text-sm font-medium text-[#122820]">{data.db.provider}</span>
            </div>
            <p className="text-xs text-[#9aa8a0]">{data.db.connected ? "连接正常" : "连接失败"} · {fmtBytes(data.db.sizeBytes)}</p>
          </CardContent>
        </Card>

        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-[#1a5632]" />知识库</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#122820]">{data.knowledge.fileCount}</p>
            <p className="text-xs text-[#9aa8a0]">
              {data.knowledge.chunkCount} chunks ·{" "}
              {data.knowledge.uncategorizedCount > 0 ? (
                <Link href="/admin/knowledge?category=未分类" className="text-amber-700 hover:underline">
                  {data.knowledge.uncategorizedCount} 未分类
                </Link>
              ) : (
                "分类完整"
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDrive className="h-4 w-4 text-[#1a5632]" />索引</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#122820]">{data.index.indexFiles.length}</p>
            <p className="text-xs text-[#9aa8a0]">{fmtBytes(data.index.totalSizeBytes)} · {data.index.indexFiles.slice(0, 3).join(", ") || "无"}</p>
          </CardContent>
        </Card>

        <Card className="border-[#1a5632]/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4 text-[#1a5632]" />服务器</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-[#6b7c72]">运行 {uptimeStr} · {data.server.nodeVersion}</p>
            <p className="text-xs text-[#9aa8a0]">{data.server.platform} · {data.server.memoryMB} MB</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#1a5632]/10">
        <CardHeader><CardTitle className="text-sm">索引文件</CardTitle></CardHeader>
        <CardContent>
          {data.index.indexFiles.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#9aa8a0]">无索引文件</p>
              <Link href="/admin/knowledge"><Button variant="outline" size="sm" className="h-7 text-xs">前往文献管理</Button></Link>
            </div>
          ) : (
            <div className="space-y-1">
              {data.index.indexFiles.map((f) => (
                <div key={f} className="flex items-center justify-between text-xs text-[#6b7c72] py-1 border-b border-[#1a5632]/5 last:border-0">
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
