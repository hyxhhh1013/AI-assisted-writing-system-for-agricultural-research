"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Loader2,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import { confirmContract, generateSocraticContractDraft, type EvaluationContractDimension } from "@/services/direction";
import type { DirectionDTO } from "@/contracts/direction";
import {
  SOCRATIC_QUESTIONS,
  SOCRATIC_QUESTION_TYPE_LABELS,
  type SocraticQuestion,
} from "@/contracts/direction-socratic";
import {
  ANALYSIS_DIMENSIONS,
  suggestParaphrasesFromAnswers,
  validateParaphraseComplete,
  buildQaPayload,
} from "@/lib/direction-pre-commitment";
import { Checkbox } from "@/components/ui/checkbox";

interface DirectionSocraticDialogProps {
  direction: DirectionDTO;
  onComplete: () => void;
}

type Stage = "intro" | "questions" | "paraphrase" | "review" | "scoring";

export function DirectionSocraticDialog({
  direction,
  onComplete,
}: DirectionSocraticDialogProps) {
  const analysis = (direction.analysis as Record<string, unknown> | null) || {};
  const existingContract = analysis.evaluationContract as
    | { dimensions?: Array<{ id: string; name?: string; rubrics?: Array<{ id: string; what_to_look_for: string }> }>; confirmedAt?: number }
    | undefined;
  const hasContract = !!existingContract?.confirmedAt;

  const [stage, setStage] = useState<Stage>(hasContract ? "review" : "intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState<EvaluationContractDimension[] | null>(null);
  const [rationale, setRationale] = useState("");
  const [sourceQuestions, setSourceQuestions] = useState<string[]>([]);
  const [paraphrases, setParaphrases] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [editedRubrics, setEditedRubrics] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);

  const totalQ = SOCRATIC_QUESTIONS.length;
  const paraphraseValidation = validateParaphraseComplete(paraphrases);
  const progress = stage === "intro" ? 0
    : stage === "questions" ? Math.round(((currentQ + 1) / totalQ) * 35)
    : stage === "paraphrase" ? 50
    : stage === "review" ? 65
    : 85;

  // ====== 问题导航 ======

  const handleAnswerNext = (answer: string) => {
    const qid = SOCRATIC_QUESTIONS[currentQ].id;
    const nextAnswers = { ...answers, [qid]: answer };
    setAnswers(nextAnswers);
    setMultiSelect(new Set());
    if (currentQ < totalQ - 1) {
      setCurrentQ((c) => c + 1);
    } else {
      setParaphrases(suggestParaphrasesFromAnswers(nextAnswers));
      setStage("paraphrase");
    }
  };

  const handlePrev = () => setCurrentQ((c) => Math.max(0, c - 1));
  const handleJumpTo = (idx: number) => setCurrentQ(idx);

  const handleMultiSelectToggle = (option: string) => {
    const next = new Set(multiSelect);
    if (next.has(option)) next.delete(option); else next.add(option);
    setMultiSelect(next);
  };

  const handleMultiSelectSubmit = () => {
    handleAnswerNext([...multiSelect].join("；"));
  };

  // ====== 生成 Rubrics ======

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const qa = buildQaPayload(answers);
      const result = await generateSocraticContractDraft(direction.slug, {
        qa,
        paraphrases,
      });

      setDraft(result.draft);
      setRationale(result.rationale);
      setSourceQuestions(result.sourceQuestions);

      const edits: Record<string, string> = {};
      for (const dim of result.draft) {
        for (const r of dim.rubrics || []) {
          edits[`${r.id}.what_to_look_for`] = r.what_to_look_for;
          edits[`${r.id}.what_triggers_block`] = r.what_triggers_block;
          edits[`${r.id}.what_triggers_warn`] = r.what_triggers_warn;
        }
      }
      setEditedRubrics(edits);
      setStage("scoring");
      toast.success("Scoring Plan 已生成，请逐项审核");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成草案失败");
    } finally {
      setIsGenerating(false);
    }
  }, [direction.slug, answers, paraphrases]);

  // ====== 确认 ======

  const handleConfirm = async () => {
    if (!draft || !acknowledged) return;
    setIsConfirming(true);
    try {
      const dimensions = draft.map((dim) => ({
        id: dim.id,
        name: dim.name,
        weight: dim.weight,
        scoring_plan: dim.scoring_plan,
        rubrics: (dim.rubrics || []).map((r) => ({
          id: r.id,
          what_to_look_for: editedRubrics[`${r.id}.what_to_look_for`] || r.what_to_look_for,
          what_triggers_block: editedRubrics[`${r.id}.what_triggers_block`] || r.what_triggers_block,
          what_triggers_warn: editedRubrics[`${r.id}.what_triggers_warn`] || r.what_triggers_warn,
          evidence_required: r.evidence_required,
        })),
      }));

      await confirmContract(direction.slug, { dimensions, userParaphrases: paraphrases });
      toast.success("预承诺已确认 — 可启动 8 维度分析");
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "确认失败");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = () => {
    setDraft(null);
    setRationale("");
    setSourceQuestions([]);
    setParaphrases({});
    setAcknowledged(false);
    setAnswers({});
    setStage("intro");
    setCurrentQ(0);
  };

  // ====== 已确认状态 ======

  if (hasContract && !draft) {
    const dims = existingContract?.dimensions || [];
    const totalRubrics = dims.reduce((s, d) => s + (d.rubrics?.length || 0), 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-[#1a5632]/6 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1a5632]/15">
            <ClipboardCheck className="h-5 w-5 text-[#1a5632]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#1a5632]">评价标准已确认 ✅</p>
            <p className="text-[11px] text-[#6b7c72]">
              {dims.length} 个维度 · {totalRubrics} 条 Rubric · 确认于 {new Date((existingContract as { confirmedAt: number }).confirmedAt).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>

        <ScrollArea className="h-[360px]">
          <div className="space-y-3 pr-2">
            {dims.map((dim) => (
              <div key={dim.id} className="rounded-lg border border-[#1a5632]/10 bg-white">
                <div className="flex items-center gap-2 border-b border-[#1a5632]/6 px-4 py-2.5">
                  <span className="text-xs font-bold text-[#1a5632]">{dim.id}</span>
                  <span className="text-sm font-medium text-[#122820]">{dim.name || dim.id}</span>
                </div>
                <div className="space-y-1.5 px-4 py-2.5">
                  {(dim.rubrics || []).map((r) => (
                    <div key={r.id} className="rounded bg-[#f6f5f1]/70 px-3 py-1.5 text-[11px] leading-relaxed text-[#3d4f46]">
                      <span className="font-medium text-[#122820]">{r.id}</span> — {r.what_to_look_for}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Button variant="outline" size="sm" className="text-xs" onClick={handleReset}>
          <RefreshCw className="h-3 w-3 mr-1" /> 重新设定评价标准
        </Button>
      </div>
    );
  }

  // ====== 介绍页 ======

  if (stage === "intro") {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a5632]/10 to-[#1a5632]/5">
          <MessageCircle className="h-8 w-8 text-[#1a5632]" />
        </div>
        <div className="max-w-md space-y-3">
          <h3 className="text-lg font-bold text-[#122820]">预承诺 — 设定评价标准</h3>
          <p className="text-sm leading-relaxed text-[#6b7c72]">
            对齐 academic-paper 预承诺协议：在<strong className="text-[#122820]">不读取资产</strong>的前提下，
            完成 {totalQ} 题 Socratic 问答 → 你亲自复述验收标准 → AI 生成 8 维 Scoring Plan → 确认后分析才按此评分。
          </p>
          <div className="rounded-lg border border-[#1a5632]/10 bg-white px-4 py-3 text-left">
            <p className="text-[11px] font-medium text-[#122820] mb-2">你将回答的问题：</p>
            <div className="space-y-1.5">
              {SOCRATIC_QUESTIONS.map((q, i) => (
                <div key={q.id} className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1a5632]/8 text-[10px] font-bold text-[#1a5632]">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#6b7c72] leading-snug">{q.question}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="h-4 px-1 text-[8px]">{SOCRATIC_QUESTION_TYPE_LABELS[q.questionType]}</Badge>
                      {q.relatedDimensions.map((d) => (
                        <Badge key={d} variant="outline" className="h-4 px-1 text-[8px] border-[#1a5632]/15 text-[#1a5632]">{d}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[#9aa8a0]">约 2 分钟完成 · AI 仅基于你的回答生成标准，不会接触资产数据</p>
        </div>
        <Button onClick={() => setStage("questions")} className={cn("gap-1.5", siteTheme.btnPrimary)} size="lg">
          开始回答问题 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ====== 问答页 ======

  if (stage === "questions") {
    const q: SocraticQuestion = SOCRATIC_QUESTIONS[currentQ];
    const prevAnswer = answers[q.id] || "";

    return (
      <div className="space-y-6">
        {/* 进度条 + 问题导航点 */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#9aa8a0]">问题 {currentQ + 1}/{totalQ}</span>
            <div className="flex gap-1">
              {SOCRATIC_QUESTIONS.map((_, i) => (
                <button
                  key={i}
                  className={cn(
                    "h-1.5 w-6 rounded-full transition-colors",
                    i === currentQ ? "bg-[#1a5632]" : answers[SOCRATIC_QUESTIONS[i].id] ? "bg-[#1a5632]/40" : "bg-[#d1d5db]",
                  )}
                  onClick={() => handleJumpTo(i)}
                  title={answers[SOCRATIC_QUESTIONS[i].id] ? "已回答" : "未回答"}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-[240px] space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1a5632]/10 text-sm font-bold text-[#1a5632]">
              {currentQ + 1}
            </span>
            <div className="pt-1">
              <h3 className="text-base font-medium text-[#122820] leading-relaxed">{q.question}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{SOCRATIC_QUESTION_TYPE_LABELS[q.questionType]}</Badge>
                {q.relatedDimensions.map((d) => (
                  <Badge key={d} variant="outline" className="h-4 px-1 text-[9px] border-[#1a5632]/15 text-[#6b7c72]">{d}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* 单选 */}
          {q.type === "single_choice" && q.options && (
            <div className="space-y-2 ml-11">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all",
                    prevAnswer === opt
                      ? "border-[#1a5632] bg-[#1a5632]/8 text-[#1a5632] shadow-sm"
                      : "border-[#1a5632]/8 bg-white text-[#3d4f46] hover:border-[#1a5632]/20 hover:bg-[#1a5632]/2",
                  )}
                  onClick={() => handleAnswerNext(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* 多选 */}
          {q.type === "multi_choice" && q.options && (
            <div className="space-y-3 ml-11">
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition-all",
                      multiSelect.has(opt)
                        ? "border-[#1a5632] bg-[#1a5632]/8 text-[#1a5632]"
                        : "border-[#1a5632]/8 bg-white text-[#3d4f46] hover:border-[#1a5632]/15",
                    )}
                    onClick={() => handleMultiSelectToggle(opt)}
                  >
                    {multiSelect.has(opt) && <Check className="mr-2 inline h-4 w-4" />}
                    {opt}
                  </button>
                ))}
              </div>
              <Button onClick={handleMultiSelectSubmit} disabled={multiSelect.size === 0} className={cn("gap-1.5 w-full", siteTheme.btnPrimary)}>
                确认选择 <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 数字 */}
          {q.type === "number" && (
            <SocraticNumberInput
              q={q}
              prevAnswer={prevAnswer}
              onNext={handleAnswerNext}
              onPrev={currentQ > 0 ? handlePrev : undefined}
            />
          )}

          {/* 自由文本 */}
          {q.type === "free_text" && (
            <SocraticFreeInput
              q={q}
              prevAnswer={prevAnswer}
              onNext={handleAnswerNext}
              onPrev={currentQ > 0 ? handlePrev : undefined}
              optional={q.id === "q6"}
            />
          )}
        </div>
      </div>
    );
  }

  // ====== 预承诺复述（Phase 4a 等价） ======

  if (stage === "paraphrase") {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <span className="text-[10px] text-[#9aa8a0]">
            Acceptance Criteria Paraphrase — 至少 {paraphraseValidation.required} 个维度（已填 {paraphraseValidation.filled}）
          </span>
        </div>

        <div className="rounded-xl border border-[#2563eb]/15 bg-[#2563eb]/4 px-4 py-3 text-xs text-[#1e40af]">
          请用<strong>你自己的话</strong>复述各维度的验收标准（可编辑 AI 草稿）。这是预承诺的核心：分析阶段将严格按此评分。
        </div>

        <ScrollArea className="h-[380px]">
          <div className="space-y-3 pr-2">
            {ANALYSIS_DIMENSIONS.map((dim) => (
              <div key={dim.id} className="rounded-lg border border-[#1a5632]/10 bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1a5632]">{dim.id}</span>
                  <span className="text-sm font-medium text-[#122820]">{dim.name}</span>
                </div>
                <Textarea
                  value={paraphrases[dim.id] || ""}
                  onChange={(e) => setParaphrases((p) => ({ ...p, [dim.id]: e.target.value }))}
                  className="min-h-[72px] resize-none text-xs"
                  placeholder={dim.coreQuestion}
                />
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setStage("questions")}>返回问答</Button>
          <Button
            size="sm"
            className={cn("gap-1.5", siteTheme.btnPrimary)}
            disabled={!paraphraseValidation.ok}
            onClick={() => setStage("review")}
          >
            确认复述，审核问答 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ====== 问答审核 + 生成 ======

  if (stage === "review") {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <span className="text-[10px] text-[#9aa8a0]">审核问答与复述，生成 Scoring Plan</span>
        </div>

        <div className="rounded-xl border border-[#1a5632]/10 bg-[#f6f5f1]/40 px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold text-[#122820]">你的 Acceptance Criteria Paraphrase</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {ANALYSIS_DIMENSIONS.filter((d) => (paraphrases[d.id] || "").trim().length >= 8).map((d) => (
              <p key={d.id} className="text-[11px] text-[#3d4f46]">
                <span className="font-medium text-[#1a5632]">{d.id}</span> {paraphrases[d.id]}
              </p>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-[10px]" onClick={() => setStage("paraphrase")}>修改复述</Button>
        </div>

        {/* 回答摘要 */}
        <div className="rounded-xl border border-[#1a5632]/10 bg-white">
          <div className="border-b border-[#1a5632]/6 px-4 py-3">
            <h4 className="text-sm font-semibold text-[#122820]">📝 你的回答</h4>
          </div>
          <div className="divide-y divide-[#1a5632]/4 px-4">
            {SOCRATIC_QUESTIONS.map((q, i) => (
              <div key={q.id} className="flex items-start gap-3 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#6b7c72]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[#6b7c72]">{q.question}</p>
                  <p className="mt-1 text-sm font-medium text-[#122820]">{answers[q.id] || "（未回答）"}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] shrink-0" onClick={() => { setCurrentQ(i); setStage("questions"); }}>
                  修改
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="text-sm text-[#6b7c72]">问答与复述确认无误，生成 8 维 Scoring Plan（paper-blind）</p>
          <Button onClick={handleGenerate} disabled={isGenerating} className={cn("gap-2", siteTheme.btnPrimary)} size="lg">
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> 生成中…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> 生成 Scoring Plan</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "scoring" && draft) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <span className="text-[10px] text-[#9aa8a0]">审核 Scoring Plan 并确认预承诺</span>
        </div>

        {rationale && (
          <div className="rounded-xl border border-[#2563eb]/20 bg-gradient-to-r from-[#2563eb]/5 to-transparent px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-[#2563eb]" />
              <span className="text-xs font-semibold text-[#2563eb]">AI 推理依据</span>
            </div>
            <p className="text-xs leading-relaxed text-[#3d4f46]">{rationale}</p>
            {sourceQuestions.length > 0 && (
              <p className="mt-2 text-[10px] text-[#9aa8a0]">主要依据问答：{sourceQuestions.join(", ")}</p>
            )}
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#122820]">
              Scoring Plan（{draft.reduce((s, d) => s + (d.rubrics?.length ?? 0), 0)} 条 Rubric）
            </h4>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={handleGenerate}>
              <RefreshCw className="h-3 w-3 mr-1" /> 重新生成
            </Button>
          </div>

          <ScrollArea className="h-[380px]">
            <div className="space-y-3 pr-2">
              {draft.map((dim) => (
                <div key={dim.id} className="rounded-xl border border-[#1a5632]/10 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 bg-[#f6f5f1]/70 px-4 py-2.5 border-b border-[#1a5632]/6">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1a5632]/10 text-[11px] font-bold text-[#1a5632]">{dim.id}</span>
                    <span className="text-sm font-medium text-[#122820]">{dim.name}</span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[9px] ml-auto">{((dim.weight ?? 0) * 100).toFixed(0)}%</Badge>
                  </div>
                  {dim.scoring_plan && (
                    <div className="border-b border-[#1a5632]/6 bg-[#2563eb]/4 px-4 py-2.5 text-[10px] space-y-1">
                      <p><span className="font-medium text-[#2563eb]">Look:</span> {dim.scoring_plan.what_to_look_for}</p>
                      <p><span className="font-medium text-[#dc2626]">Block:</span> {dim.scoring_plan.what_triggers_block}</p>
                      <p><span className="font-medium text-[#d97706]">Warn:</span> {dim.scoring_plan.what_triggers_warn}</p>
                    </div>
                  )}
                  <div className="space-y-3 px-4 py-3">
                    {(dim.rubrics ?? []).map((r) => (
                      <div key={r.id} className="space-y-1.5 rounded-lg bg-[#f6f5f1]/40 p-3">
                        <span className="text-[11px] font-semibold text-[#1a5632]">{r.id}</span>
                        <RubricEditField label="what_to_look_for" value={editedRubrics[`${r.id}.what_to_look_for`] || r.what_to_look_for} onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_to_look_for`]: v }))} />
                        <div className="grid grid-cols-2 gap-2">
                          <RubricEditField label="Block" value={editedRubrics[`${r.id}.what_triggers_block`] || r.what_triggers_block} onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_triggers_block`]: v }))} />
                          <RubricEditField label="Warn" value={editedRubrics[`${r.id}.what_triggers_warn`] || r.what_triggers_warn} onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_triggers_warn`]: v }))} />
                        </div>
                        <p className="text-[10px] text-[#9aa8a0]">证据: {r.evidence_required}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-[#1a5632]/15 px-3 py-2.5 text-xs cursor-pointer">
          <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} className="mt-0.5" />
          <span>我确认以上 Scoring Plan 将在分析中严格执行；制定标准时未读取资产（Paper-Blind）。</span>
        </label>

        <div className="flex justify-end gap-2 border-t border-[#1a5632]/8 pt-4">
          <Button variant="outline" size="sm" onClick={() => setStage("review")}>返回</Button>
          <Button size="sm" onClick={handleConfirm} disabled={isConfirming || !acknowledged} className={cn("gap-1.5", siteTheme.btnPrimary)}>
            {isConfirming ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 确认中…</> : <><Check className="h-3.5 w-3.5" /> 确认预承诺</>}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ====== 子组件 ======

function SocraticNumberInput({
  q,
  prevAnswer,
  onNext,
  onPrev,
}: {
  q: SocraticQuestion;
  prevAnswer: string;
  onNext: (v: string) => void;
  onPrev?: () => void;
}) {
  const [value, setValue] = useState(prevAnswer);

  return (
    <div className="ml-11 space-y-4">
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={q.placeholder}
        className="w-full rounded-xl border-2 border-[#1a5632]/15 px-5 py-4 text-xl font-mono text-[#122820] focus:border-[#1a5632] focus:outline-none focus:ring-4 focus:ring-[#1a5632]/10 transition-all"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && value) onNext(value || "3"); }}
      />
      <div className="flex gap-2">
        {onPrev && (
          <Button variant="outline" size="sm" onClick={onPrev} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> 上一题
          </Button>
        )}
        <Button onClick={() => onNext(value || "3")} disabled={!value} className={cn("gap-1.5 flex-1", siteTheme.btnPrimary)}>
          下一题 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SocraticFreeInput({
  q,
  prevAnswer,
  onNext,
  onPrev,
  optional,
}: {
  q: SocraticQuestion;
  prevAnswer: string;
  onNext: (v: string) => void;
  onPrev?: () => void;
  optional?: boolean;
}) {
  const [value, setValue] = useState(prevAnswer);

  return (
    <div className="ml-11 space-y-4">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={q.placeholder}
        className="h-32 resize-none rounded-xl border-2 border-[#1a5632]/15 text-sm focus:border-[#1a5632] focus:ring-4 focus:ring-[#1a5632]/10 transition-all"
        autoFocus
      />
      <div className="flex gap-2">
        {onPrev && (
          <Button variant="outline" size="sm" onClick={onPrev} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> 上一题
          </Button>
        )}
        {optional && (
          <Button variant="ghost" size="sm" onClick={() => onNext("无")} className="text-xs">
            跳过此问题
          </Button>
        )}
        <Button onClick={() => onNext(value || "无")} className={cn("gap-1.5 flex-1", siteTheme.btnPrimary)}>
          下一题 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RubricEditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] text-[#9aa8a0]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#1a5632]/10 bg-white px-3 py-2 text-[11px] text-[#3d4f46] resize-none focus:border-[#1a5632]/30 focus:outline-none focus:ring-2 focus:ring-[#1a5632]/10"
        rows={2}
      />
    </div>
  );
}
