"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Database, FileText, HardDrive, Server } from "lucide-react";

interface Health {
  db: { connected: boolean; provider: string; sizeBytes: number };
  knowledge: { fileCount: number; chunkCount: number; uncategorizedCount: number };
  index: { indexFiles: string[]; totalSizeBytes: number };
  server: { uptime: number; nodeVersion: string; platform: string; memoryMB: number };
}

export default function AdminHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/health").then(r => r.json()).then(d => { if (d.success) setData(d.data); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" /></div>;
  if (!data) return <div className="text-sm text-red-600">加载失败</div>;

  const fmtBytes = (b: number) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
  const uptimeStr = `${Math.floor(data.server.uptime / 3600)}h ${Math.floor((data.server.uptime % 3600) / 60)}m`;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-[#122820]">系统健康</h2>

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
            <p className="text-xs text-[#9aa8a0]">{data.knowledge.chunkCount} chunks · {data.knowledge.uncategorizedCount} 未分类</p>
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

      {/* 索引文件列表 */}
      <Card className="border-[#1a5632]/10">
        <CardHeader><CardTitle className="text-sm">索引文件</CardTitle></CardHeader>
        <CardContent>
          {data.index.indexFiles.length === 0 ? <p className="text-sm text-[#9aa8a0]">无索引文件</p> : (
            <div className="space-y-1">
              {data.index.indexFiles.map(f => (
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
