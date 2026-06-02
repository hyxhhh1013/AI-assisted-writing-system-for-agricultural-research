"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, User, Mail, Calendar, BarChart3 } from "lucide-react";
import Link from "next/link";
import { getAdminUser, type AdminUserDetail } from "@/services/admin";
import { useGoBack } from "@/contexts/navigation-history";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const goBack = useGoBack();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminUser(id).then(setData).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-[#6b7c72]"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>;
  if (!data) return <div className="text-sm text-red-600">用户不存在</div>;

  const tplLabel: Record<string, string> = { sci: "SCI", ieee: "IEEE", gbt7713: "GB/T 7713", nature: "Nature" };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => goBack("/admin/users")} className="gap-1">
        <ArrowLeft className="h-4 w-4" />返回用户列表
      </Button>

      <Card className="border-[#1a5632]/10">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-[#1a5632]" />{data.name}
            <Badge variant={data.role === "admin" ? "default" : "secondary"} className="text-[10px]">{data.role}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-[#6b7c72]">
          <p><Mail className="h-3.5 w-3.5 inline mr-1" />{data.email}</p>
          <p><Calendar className="h-3.5 w-3.5 inline mr-1" />注册于 {new Date(data.createdAt).toLocaleDateString("zh-CN")}</p>
          <p><BarChart3 className="h-3.5 w-3.5 inline mr-1" />AI 调用 {data.totalAiCalls} 次</p>
        </CardContent>
      </Card>

      <Card className="border-[#1a5632]/10">
        <CardHeader><CardTitle className="text-sm">项目列表（{data.projects.length}）</CardTitle></CardHeader>
        <CardContent>
          {data.projects.length === 0 ? (
            <p className="text-sm text-[#9aa8a0] py-4 text-center">暂无项目</p>
          ) : (
            <div className="space-y-2">
              {data.projects.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#1a5632]/10 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#122820] truncate">{p.title || "未命名"}</p>
                    <p className="text-[10px] text-[#9aa8a0]">
                      {tplLabel[p.template] || p.template} · {p.mode === "research" ? "研究" : "综述"} · {p.sectionCount}章 · {p.referenceCount}文献
                    </p>
                  </div>
                  <Link href={`/workbench?id=${p.id}`} target="_blank" className="text-[10px] text-[#1a5632] hover:underline shrink-0 ml-3">
                    打开
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {Object.keys(data.aiUsage).length > 0 && (
        <Card className="border-[#1a5632]/10">
          <CardHeader><CardTitle className="text-sm">AI 功能用量</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {Object.entries(data.aiUsage).map(([feature, count]) => (
                <div key={feature} className="flex items-center justify-between text-xs">
                  <span className="text-[#3d4f46]">{feature}</span>
                  <span className="text-[#1a5632] font-medium">{count} 次</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
