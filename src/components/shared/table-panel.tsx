"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Table2, FileText, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface GroupInput {
  label: string;
  n: string;
  mean: string;
  sd: string;
}

interface PosthocInput {
  pairA: string;
  pairB: string;
  p: string;
}

export function TablePanel() {
  const [title, setTitle] = useState("表1 ");
  const [columnHeader, setColumnHeader] = useState("指标");
  const [groups, setGroups] = useState<GroupInput[]>([
    { label: "处理A", n: "30", mean: "", sd: "" },
    { label: "处理B", n: "30", mean: "", sd: "" },
    { label: "处理C", n: "30", mean: "", sd: "" },
  ]);
  const [anova, setAnova] = useState({ F: "", df1: "", df2: "", p: "" });
  const [posthoc, setPosthoc] = useState<PosthocInput[]>([
    { pairA: "A", pairB: "B", p: "" },
    { pairA: "A", pairB: "C", p: "" },
    { pairA: "B", pairB: "C", p: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ latex: string; html: string; statsText: string; letters: Record<string, string> } | null>(null);
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [copied, setCopied] = useState(false);

  const updateGroup = (i: number, field: keyof GroupInput, val: string) => {
    const next = [...groups];
    next[i] = { ...next[i], [field]: val };
    setGroups(next);
  };

  const addGroup = () => setGroups([...groups, { label: "", n: "", mean: "", sd: "" }]);
  const removeGroup = (i: number) => {
    if (groups.length <= 2) return;
    setGroups(groups.filter((_, j) => j !== i));
  };

  const updatePosthoc = (i: number, field: keyof PosthocInput, val: string) => {
    const next = [...posthoc];
    next[i] = { ...next[i], [field]: val };
    setPosthoc(next);
  };

  const addPosthoc = () => setPosthoc([...posthoc, { pairA: "", pairB: "", p: "" }]);

  const handleGenerate = async () => {
    const validGroups = groups.filter(g => g.label && g.mean);
    if (validGroups.length < 2) { toast.error("请填写至少 2 个处理组（标签和均值）"); return; }
    setLoading(true);
    try {
      const body: any = {
        title, columnHeader,
        groups: validGroups.map(g => ({
          label: g.label,
          n: parseInt(g.n) || 0,
          mean: parseFloat(g.mean),
          sd: parseFloat(g.sd) || 0,
        })),
      };
      const fv = parseFloat(anova.F);
      const d1 = parseInt(anova.df1);
      const d2 = parseInt(anova.df2);
      const ap = parseFloat(anova.p);
      if (!isNaN(fv) && !isNaN(d1) && !isNaN(d2) && !isNaN(ap)) {
        body.anova = { F: fv, df1: d1, df2: d2, p: ap };
      }
      const validPosthoc = posthoc.filter(ph => ph.pairA && ph.pairB && ph.p);
      if (validPosthoc.length > 0) {
        body.posthoc = validPosthoc.map(ph => ({
          pair: [ph.pairA, ph.pairB],
          p: parseFloat(ph.p),
        }));
      }
      const res = await fetch("/api/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setResult(data);
      toast.success("三线表生成成功");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Table2 className="h-4 w-4" /> 三线表生成 (GB/T 7714)
          </CardTitle>
          <CardDescription className="text-[10px]">
            填入处理组数据 + ANOVA + 事后检验，自动生成三线表、字母标注和统计文字
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">表标题</Label>
              <Input className="h-8 text-xs mt-1" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">指标列名</Label>
              <Input className="h-8 text-xs mt-1" value={columnHeader} onChange={e => setColumnHeader(e.target.value)} />
            </div>
          </div>

          {/* 处理组 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">处理组（均值 ± SD）</Label>
              <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addGroup}>+ 添加组</Button>
            </div>
            <div className="space-y-1">
              {groups.map((g, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input className="h-7 text-xs w-20" placeholder="标签" value={g.label} onChange={e => updateGroup(i, "label", e.target.value)} />
                  <Input className="h-7 text-xs w-12" placeholder="n" value={g.n} onChange={e => updateGroup(i, "n", e.target.value)} />
                  <Input className="h-7 text-xs w-16" placeholder="均值" value={g.mean} onChange={e => updateGroup(i, "mean", e.target.value)} />
                  <Input className="h-7 text-xs w-14" placeholder="SD" value={g.sd} onChange={e => updateGroup(i, "sd", e.target.value)} />
                  {groups.length > 2 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[10px] text-red-400" onClick={() => removeGroup(i)}>×</Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ANOVA */}
          <div>
            <Label className="text-xs">ANOVA（可选）</Label>
            <div className="flex gap-1 mt-1">
              <Input className="h-7 text-xs w-20" placeholder="F值" value={anova.F} onChange={e => setAnova({...anova, F: e.target.value})} />
              <Input className="h-7 text-xs w-14" placeholder="df1" value={anova.df1} onChange={e => setAnova({...anova, df1: e.target.value})} />
              <Input className="h-7 text-xs w-14" placeholder="df2" value={anova.df2} onChange={e => setAnova({...anova, df2: e.target.value})} />
              <Input className="h-7 text-xs w-20" placeholder="p值" value={anova.p} onChange={e => setAnova({...anova, p: e.target.value})} />
            </div>
          </div>

          {/* Post-hoc */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">事后检验（可选）</Label>
              <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addPosthoc}>+ 添加对比</Button>
            </div>
            <div className="space-y-1">
              {posthoc.map((ph, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input className="h-7 text-xs w-16" placeholder="组A" value={ph.pairA} onChange={e => updatePosthoc(i, "pairA", e.target.value)} />
                  <span className="text-[10px] text-muted-foreground">vs</span>
                  <Input className="h-7 text-xs w-16" placeholder="组B" value={ph.pairB} onChange={e => updatePosthoc(i, "pairB", e.target.value)} />
                  <Input className="h-7 text-xs w-20" placeholder="p值" value={ph.p} onChange={e => updatePosthoc(i, "p", e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <Button size="sm" className="w-full text-xs" onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Table2 className="mr-2 h-3 w-3" />}
            {loading ? "生成中..." : "生成三线表"}
          </Button>
        </CardContent>
      </Card>

      {/* 结果 */}
      {result && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> 生成结果
              </CardTitle>
              <div className="flex gap-1">
                <Button variant={previewMode === "html" ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setPreviewMode("html")}>表格</Button>
                <Button variant={previewMode === "text" ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setPreviewMode("text")}>文字</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {previewMode === "html" ? (
              <>
                <div className="border rounded-lg p-4 bg-white overflow-x-auto" dangerouslySetInnerHTML={{ __html: result.html }} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1 flex-1" onClick={() => {
                    navigator.clipboard.writeText(result.latex);
                    setCopied(true);
                    toast.success("LaTeX 代码已复制");
                    setTimeout(() => setCopied(false), 2000);
                  }}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    复制 LaTeX
                  </Button>
                </div>
                <details className="text-[10px] text-muted-foreground">
                  <summary>查看 LaTeX 源码</summary>
                  <pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto whitespace-pre-wrap">{result.latex}</pre>
                </details>
              </>
            ) : (
              <div className="p-3 bg-muted/20 rounded text-xs leading-relaxed whitespace-pre-wrap">{result.statsText}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
