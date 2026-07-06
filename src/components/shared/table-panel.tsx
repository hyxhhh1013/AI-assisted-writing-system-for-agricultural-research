"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateTable, type TableGenerateRequest } from "@/services/table";
import { getErrorMessage } from "@/lib/error-utils";
import { PlotWorkspace } from "@/components/shared/plot/plot-workspace";
import { PlotPreviewPane } from "@/components/shared/plot/plot-preview-pane";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

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

export function TablePanel({ title: toolTitle, description, onInsertTable }: PlotToolProps) {
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

  const canGenerate = groups.filter((g) => g.label && g.mean).length >= 2;

  const handleGenerate = async () => {
    const validGroups = groups.filter((g) => g.label && g.mean);
    if (validGroups.length < 2) {
      toast.error("请填写至少 2 个处理组（标签和均值）");
      return;
    }
    setLoading(true);
    try {
      const body: TableGenerateRequest = {
        title,
        columnHeader,
        groups: validGroups.map((g) => ({
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
      const validPosthoc = posthoc.filter((ph) => ph.pairA && ph.pairB && ph.p);
      if (validPosthoc.length > 0) {
        body.posthoc = validPosthoc.map((ph) => ({
          pair: [ph.pairA, ph.pairB],
          p: parseFloat(ph.p),
        }));
      }
      const data = await generateTable(body);
      setResult(data);
      toast.success("三线表生成成功");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? getErrorMessage(err) : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlotWorkspace
      title={toolTitle ?? "三线表 (GB/T 7714)"}
      description={description ?? "填入处理组数据与统计检验，自动生成三线表与字母标注"}
      config={
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-5 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">表标题</Label>
                <Input className="mt-1 h-8 text-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">指标列名</Label>
                <Input className="mt-1 h-8 text-xs" value={columnHeader} onChange={(e) => setColumnHeader(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">处理组（均值 ± SD）</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addGroup}>
                  + 添加组
                </Button>
              </div>
              <div className="space-y-1">
                {groups.map((g, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input className="h-7 w-20 text-xs" placeholder="标签" value={g.label} onChange={(e) => updateGroup(i, "label", e.target.value)} />
                    <Input className="h-7 w-12 text-xs" placeholder="n" value={g.n} onChange={(e) => updateGroup(i, "n", e.target.value)} />
                    <Input className="h-7 w-16 text-xs" placeholder="均值" value={g.mean} onChange={(e) => updateGroup(i, "mean", e.target.value)} />
                    <Input className="h-7 w-14 text-xs" placeholder="SD" value={g.sd} onChange={(e) => updateGroup(i, "sd", e.target.value)} />
                    {groups.length > 2 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[10px] text-red-400" onClick={() => removeGroup(i)}>
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">ANOVA（可选）</Label>
              <div className="mt-1 flex gap-1">
                <Input className="h-7 w-20 text-xs" placeholder="F值" value={anova.F} onChange={(e) => setAnova({ ...anova, F: e.target.value })} />
                <Input className="h-7 w-14 text-xs" placeholder="df1" value={anova.df1} onChange={(e) => setAnova({ ...anova, df1: e.target.value })} />
                <Input className="h-7 w-14 text-xs" placeholder="df2" value={anova.df2} onChange={(e) => setAnova({ ...anova, df2: e.target.value })} />
                <Input className="h-7 w-20 text-xs" placeholder="p值" value={anova.p} onChange={(e) => setAnova({ ...anova, p: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">事后检验（可选）</Label>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={addPosthoc}>
                  + 添加对比
                </Button>
              </div>
              <div className="space-y-1">
                {posthoc.map((ph, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input className="h-7 w-16 text-xs" placeholder="组A" value={ph.pairA} onChange={(e) => updatePosthoc(i, "pairA", e.target.value)} />
                    <span className="text-[10px] text-muted-foreground">vs</span>
                    <Input className="h-7 w-16 text-xs" placeholder="组B" value={ph.pairB} onChange={(e) => updatePosthoc(i, "pairB", e.target.value)} />
                    <Input className="h-7 w-20 text-xs" placeholder="p值" value={ph.p} onChange={(e) => updatePosthoc(i, "p", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      }
      preview={
        <PlotPreviewPane
          paneTitle="表格预览"
          loading={loading}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          generateLabel="生成三线表"
          regenerateLabel="重新生成"
          readyHint="数据已就绪，点击上方「生成三线表」"
          emptyTitle="等待数据"
          emptyHint="在左侧填写至少 2 个处理组的标签与均值。"
          footer={
            result ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto flex gap-1">
                  <Button
                    variant={previewMode === "html" ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setPreviewMode("html")}
                  >
                    表格
                  </Button>
                  <Button
                    variant={previewMode === "text" ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setPreviewMode("text")}
                  >
                    统计文字
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(result.latex);
                    setCopied(true);
                    toast.success("LaTeX 代码已复制");
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  复制 LaTeX
                </Button>
                {onInsertTable && (
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-[#1a5632] text-xs hover:bg-[#144228]"
                    onClick={() => onInsertTable(title.trim() || "三线表", result.html, result.statsText)}
                  >
                    <FileText className="h-3 w-3" />
                    插入论文
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {result && !loading && (
            previewMode === "html" ? (
              <div
                className="rounded-lg border border-[#1a5632]/10 bg-white p-4"
                dangerouslySetInnerHTML={{ __html: result.html }}
              />
            ) : (
              <div className="rounded-lg bg-[#faf9f6] p-4 text-xs leading-relaxed whitespace-pre-wrap text-[#122820]">
                {result.statsText}
              </div>
            )
          )}
        </PlotPreviewPane>
      }
    />
  );
}
