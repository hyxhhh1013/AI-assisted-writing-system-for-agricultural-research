"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, FileText, Database, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import type { DirectionAsset, ExperimentAsset, PaperAsset, DatasetAsset } from "@/contracts/direction";

interface DirectionAssetFormProps {
  onSave: (asset: DirectionAsset) => void;
  onCancel: () => void;
  editAsset?: DirectionAsset | null;
}

function newExperiment(): ExperimentAsset {
  return {
    id: `exp-${Date.now()}`,
    kind: "experiment",
    title: "",
    dateRange: "",
    researchQuestion: "",
    methods: "",
    keyFindings: "",
    limitations: "",
    isNegativeResult: false,
    linkedDatasets: [],
    linkedPapers: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function newPaper(): PaperAsset {
  return {
    id: `paper-${Date.now()}`,
    kind: "paper",
    doi: "",
    title: "",
    journal: "",
    year: new Date().getFullYear(),
    abstract: "",
    contribution: "",
    linkedExperiments: [],
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function newDataset(): DatasetAsset {
  return {
    id: `ds-${Date.now()}`,
    kind: "dataset",
    title: "",
    filePath: "",
    variables: "",
    sampleSize: "",
    linkedExperiments: [],
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function DirectionAssetForm({ onSave, onCancel, editAsset }: DirectionAssetFormProps) {
  const [tab, setTab] = useState<string>(editAsset?.kind || "experiment");
  const [experiment, setExperiment] = useState<ExperimentAsset>(
    editAsset?.kind === "experiment" ? (editAsset as ExperimentAsset) : newExperiment(),
  );
  const [paper, setPaper] = useState<PaperAsset>(
    editAsset?.kind === "paper" ? (editAsset as PaperAsset) : newPaper(),
  );
  const [dataset, setDataset] = useState<DatasetAsset>(
    editAsset?.kind === "dataset" ? (editAsset as DatasetAsset) : newDataset(),
  );

  const handleSave = () => {
    const now = Date.now();
    if (tab === "experiment") {
      onSave({ ...experiment, kind: "experiment", updatedAt: now });
    } else if (tab === "paper") {
      onSave({ ...paper, kind: "paper", updatedAt: now });
    } else {
      onSave({ ...dataset, kind: "dataset", updatedAt: now });
    }
  };

  const canSave = () => {
    if (tab === "experiment") {
      return experiment.title.trim() && experiment.researchQuestion.trim() && experiment.keyFindings.trim() && experiment.limitations.trim();
    }
    if (tab === "paper") {
      return paper.doi.trim() && paper.contribution.trim();
    }
    return dataset.title.trim() && dataset.variables.trim();
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9 w-full">
          <TabsTrigger value="experiment" className="flex-1 gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5" /> 实验/试验
          </TabsTrigger>
          <TabsTrigger value="paper" className="flex-1 gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> 已发表论文
          </TabsTrigger>
          <TabsTrigger value="dataset" className="flex-1 gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5" /> 数据集
          </TabsTrigger>
        </TabsList>

        {/* 实验表单 */}
        <TabsContent value="experiment" className="mt-4 space-y-3">
          <div>
            <Label>实验名称 <span className="text-red-500">*</span></Label>
            <Input value={experiment.title} onChange={(e) => setExperiment({ ...experiment, title: e.target.value })} placeholder="如 高温裂解实验 2024Q1" className="mt-1 text-sm" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>时间范围</Label>
              <Input value={experiment.dateRange} onChange={(e) => setExperiment({ ...experiment, dateRange: e.target.value })} placeholder="2024-01 ~ 2024-03" className="mt-1 text-sm" />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={experiment.isNegativeResult} onCheckedChange={(v) => setExperiment({ ...experiment, isNegativeResult: !!v })} />
                此实验为负结果（记录以避重复）
              </label>
            </div>
          </div>
          <div>
            <Label>研究问题 <span className="text-red-500">*</span></Label>
            <Textarea value={experiment.researchQuestion} onChange={(e) => setExperiment({ ...experiment, researchQuestion: e.target.value })} placeholder="这个实验要回答什么科学问题？" className="mt-1 h-20 resize-none text-sm" />
          </div>
          <div>
            <Label>关键方法</Label>
            <Textarea value={experiment.methods} onChange={(e) => setExperiment({ ...experiment, methods: e.target.value })} placeholder="关键方法和实验条件…" className="mt-1 h-16 resize-none text-sm" />
          </div>
          <div>
            <Label>关键发现 <span className="text-red-500">*</span></Label>
            <Textarea value={experiment.keyFindings} onChange={(e) => setExperiment({ ...experiment, keyFindings: e.target.value })} placeholder="定量结果和统计结论…" className="mt-1 h-20 resize-none text-sm" />
          </div>
          <div>
            <Label>局限与不足 <span className="text-red-500">*</span></Label>
            <Textarea value={experiment.limitations} onChange={(e) => setExperiment({ ...experiment, limitations: e.target.value })} placeholder="实验不足和遗留问题…" className="mt-1 h-16 resize-none text-sm" />
          </div>
        </TabsContent>

        {/* 论文表单 */}
        <TabsContent value="paper" className="mt-4 space-y-3">
          <div>
            <Label>DOI <span className="text-red-500">*</span></Label>
            <Input value={paper.doi} onChange={(e) => setPaper({ ...paper, doi: e.target.value })} placeholder="如 10.1016/j.biortech.2024.130123" className="mt-1 font-mono text-sm" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>论文标题</Label>
              <Input value={paper.title} onChange={(e) => setPaper({ ...paper, title: e.target.value })} placeholder="输入 DOI 后自动补全" className="mt-1 text-sm" />
            </div>
            <div>
              <Label>期刊</Label>
              <Input value={paper.journal} onChange={(e) => setPaper({ ...paper, journal: e.target.value })} placeholder="自动补全" className="mt-1 text-sm" />
            </div>
            <div>
              <Label>年份</Label>
              <Input type="number" value={paper.year || ""} onChange={(e) => setPaper({ ...paper, year: parseInt(e.target.value) || 0 })} className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label>对本方向的学术贡献 <span className="text-red-500">*</span></Label>
            <Textarea value={paper.contribution} onChange={(e) => setPaper({ ...paper, contribution: e.target.value })} placeholder="人总结：这篇论文对本研究方向的学术贡献是什么？" className="mt-1 h-20 resize-none text-sm" />
          </div>
        </TabsContent>

        {/* 数据集表单 */}
        <TabsContent value="dataset" className="mt-4 space-y-3">
          <div>
            <Label>数据集名称 <span className="text-red-500">*</span></Label>
            <Input value={dataset.title} onChange={(e) => setDataset({ ...dataset, title: e.target.value })} placeholder="如 热解产物 GC-MS 分析数据" className="mt-1 text-sm" />
          </div>
          <div>
            <Label>文件路径</Label>
            <Input value={dataset.filePath || ""} onChange={(e) => setDataset({ ...dataset, filePath: e.target.value })} placeholder="data/xxx.csv" className="mt-1 font-mono text-sm" />
          </div>
          <div>
            <Label>变量说明 <span className="text-red-500">*</span></Label>
            <Textarea value={dataset.variables} onChange={(e) => setDataset({ ...dataset, variables: e.target.value })} placeholder="名称/单位/取值范围，每行一个变量…" className="mt-1 h-20 resize-none text-sm" />
          </div>
          <div>
            <Label>样本量</Label>
            <Input value={dataset.sampleSize || ""} onChange={(e) => setDataset({ ...dataset, sampleSize: e.target.value })} placeholder="如 n=30" className="mt-1 text-sm" />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-2 border-t border-[#1a5632]/8 pt-4">
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave()} className={cn("gap-1.5", siteTheme.btnPrimary)}>
          <Save className="h-3.5 w-3.5" />
          {editAsset ? "更新资产" : "添加资产"}
        </Button>
      </div>
    </div>
  );
}
