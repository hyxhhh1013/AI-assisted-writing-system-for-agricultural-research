"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import { generateContractDraft, confirmContract } from "@/services/direction";
import type { DirectionDTO } from "@/contracts/direction";
import {
  SOCRATIC_QUESTIONS,
  type SocraticQuestion,
  type SocraticAnswer,
} from "@/contracts/direction-socratic";

interface DirectionSocraticDialogProps {
  direction: DirectionDTO;
  onComplete: () => void;
}

type Stage = "intro" | "questions" | "review";

export function DirectionSocraticDialog({
  direction,
  onComplete,
}: DirectionSocraticDialogProps) {
  const [stage, setStage] = useState<Stage>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState<Array<{
    id: string;
    name: string;
    weight: number;
    rubrics: Array<{
      id: string;
      what_to_look_for: string;
      what_triggers_block: string;
      what_triggers_warn: string;
      evidence_required: string;
    }>;
  }> | null>(null);
  const [rationale, setRationale] = useState("");
  const [editedRubrics, setEditedRubrics] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);

  const totalQ = SOCRATIC_QUESTIONS.length;
  const progress = stage === "intro" ? 0
    : stage === "questions" ? Math.round(((currentQ + 1) / totalQ) * 50)
    : 75;

  // ====== 问题导航 ======

  const handleAnswerNext = (answer: string) => {
    setAnswers((prev) => ({ ...prev, [SOCRATIC_QUESTIONS[currentQ].id]: answer }));
    setMultiSelect(new Set());
    if (currentQ < totalQ - 1) {
      setCurrentQ((c) => c + 1);
    } else {
      // 所有问题回答完毕
      setStage("review");
    }
  };

  const handlePrev = () => setCurrentQ((c) => Math.max(0, c - 1));

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
      const qa: SocraticAnswer[] = SOCRATIC_QUESTIONS.map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers[q.id] || "（未回答）",
      }));

      // 调用新的 socratic-draft API
      const res = await fetch(`/api/directions/${direction.slug}/evaluation-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "socratic-draft", qa }),
      });

      const data = await res.json() as {
        draft?: Array<{
          id: string;
          name: string;
          weight: number;
          rubrics: Array<{
            id: string;
            what_to_look_for: string;
            what_triggers_block: string;
            what_triggers_warn: string;
            evidence_required: string;
          }>;
        }>;
        rationale?: string;
        error?: string;
      };

      if (!res.ok || !data.draft) {
        throw new Error(data.error || "生成失败");
      }

      setDraft(data.draft);
      setRationale(data.rationale || "");

      // 预填编辑缓冲区
      const edits: Record<string, string> = {};
      for (const dim of data.draft) {
        for (const r of dim.rubrics) {
          edits[`${r.id}.what_to_look_for`] = r.what_to_look_for;
          edits[`${r.id}.what_triggers_block`] = r.what_triggers_block;
          edits[`${r.id}.what_triggers_warn`] = r.what_triggers_warn;
        }
      }
      setEditedRubrics(edits);

      toast.success("Rubrics 草案已生成，请逐项审核");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成草案失败");
    } finally {
      setIsGenerating(false);
    }
  }, [direction.slug, answers]);

  // ====== 确认 ======

  const handleConfirm = async () => {
    if (!draft) return;
    setIsConfirming(true);
    try {
      // 应用用户编辑
      const dimensions = draft.map((dim) => ({
        id: dim.id,
        name: dim.name,
        weight: dim.weight,
        rubrics: dim.rubrics.map((r) => ({
          ...r,
          what_to_look_for: editedRubrics[`${r.id}.what_to_look_for`] || r.what_to_look_for,
          what_triggers_block: editedRubrics[`${r.id}.what_triggers_block`] || r.what_triggers_block,
          what_triggers_warn: editedRubrics[`${r.id}.what_triggers_warn`] || r.what_triggers_warn,
        })),
      }));

      await confirmContract(direction.slug, { dimensions });
      toast.success("评价标准已确认");
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "确认失败");
    } finally {
      setIsConfirming(false);
    }
  };

  // ====== 渲染：介绍页 ======

  if (stage === "intro") {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a5632]/10">
          <MessageCircle className="h-7 w-7 text-[#1a5632]" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-lg font-semibold text-[#122820]">设定评价标准</h3>
          <p className="text-sm leading-relaxed text-[#6b7c72]">
            在 AI 分析你的实验资产之前，需要先确定评价标准。
            回答几个简单的问题，AI 会根据你的领域惯例自动生成 8 个维度的检查标准。
          </p>
          <p className="text-xs text-[#9aa8a0]">
            共 {totalQ} 个问题，约 2 分钟完成。你的回答将决定 AI 如何评估数据的充分性和论文的发表潜力。
          </p>
        </div>
        <Button
          onClick={() => setStage("questions")}
          className={cn("gap-1.5", siteTheme.btnPrimary)}
        >
          开始 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ====== 渲染：问答 ======

  if (stage === "questions") {
    const q: SocraticQuestion = SOCRATIC_QUESTIONS[currentQ];
    const prevAnswer = answers[q.id] || "";

    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-[#9aa8a0]">
            <span>问题 {currentQ + 1}/{totalQ}</span>
            <span>{progress}%</span>
          </div>
        </div>

        <div className="min-h-[200px] space-y-4">
          <h3 className="text-base font-medium text-[#122820] leading-relaxed">
            {q.question}
          </h3>

          {/* 单选 */}
          {q.type === "single_choice" && q.options && (
            <div className="space-y-2">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    prevAnswer === opt
                      ? "border-[#1a5632]/30 bg-[#1a5632]/8 text-[#1a5632]"
                      : "border-[#1a5632]/8 bg-white text-[#3d4f46] hover:border-[#1a5632]/15",
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
            <div className="space-y-3">
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      multiSelect.has(opt)
                        ? "border-[#1a5632]/30 bg-[#1a5632]/8 text-[#1a5632]"
                        : "border-[#1a5632]/8 bg-white text-[#3d4f46] hover:border-[#1a5632]/15",
                    )}
                    onClick={() => handleMultiSelectToggle(opt)}
                  >
                    {multiSelect.has(opt) && <Check className="mr-2 inline h-3.5 w-3.5" />}
                    {opt}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleMultiSelectSubmit}
                disabled={multiSelect.size === 0}
                className={cn("gap-1.5 w-full", siteTheme.btnPrimary)}
              >
                确认选择 <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 数字 */}
          {q.type === "number" && (
            <NumberInput
              question={q}
              prevAnswer={prevAnswer}
              onNext={handleAnswerNext}
              onPrev={currentQ > 0 ? handlePrev : undefined}
            />
          )}

          {/* 自由文本 */}
          {q.type === "free_text" && (
            <FreeTextInput
              question={q}
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

  // ====== 渲染：审核 ======

  if (stage === "review") {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-[#9aa8a0]">
            <span>审核 {progress}%</span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-medium text-[#122820]">回答确认</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {SOCRATIC_QUESTIONS.map((q, i) => (
              <div key={q.id} className="flex items-start gap-2 rounded-lg border border-[#1a5632]/8 bg-white px-3 py-2">
                <span className="text-[10px] font-medium text-[#9aa8a0] shrink-0 mt-0.5">Q{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#6b7c72] line-clamp-1">{q.question}</p>
                  <p className="text-sm text-[#122820]">{answers[q.id] || "（未回答）"}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] shrink-0"
                  onClick={() => { setCurrentQ(i); setStage("questions"); }}
                >
                  修改
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 py-4">
            {!draft ? (
              <>
                <p className="text-sm text-[#6b7c72]">
                  回答确认无误，现在让 AI 根据你的回答生成 8 个维度的评价 Rubrics
                </p>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={cn("gap-1.5", siteTheme.btnPrimary)}
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> 生成中…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> AI 生成 Rubrics 草案</>
                  )}
                </Button>
              </>
            ) : (
              <>
                {rationale && (
                  <div className="w-full rounded-lg border border-[#2563eb]/20 bg-[#2563eb]/3 px-4 py-3">
                    <p className="text-xs font-medium text-[#2563eb]">📋 AI 推理依据</p>
                    <p className="mt-1 text-xs text-[#3d4f46] leading-relaxed">{rationale}</p>
                  </div>
                )}

                <div className="w-full space-y-3 max-h-[500px] overflow-y-auto">
                  <h4 className="text-sm font-medium text-[#122820]">
                    请逐项审核 8 维度 Rubrics（共 {draft.reduce((s, d) => s + d.rubrics.length, 0)} 条）
                  </h4>
                  {draft.map((dim) => (
                    <div key={dim.id} className="rounded-lg border border-[#1a5632]/10 bg-white">
                      <div className="flex items-center gap-2 border-b border-[#1a5632]/6 px-4 py-2.5">
                        <span className="text-xs font-bold text-[#1a5632]">{dim.id}</span>
                        <span className="text-sm font-medium text-[#122820]">{dim.name}</span>
                        <Badge variant="secondary" className="h-4 px-1 text-[9px]">权重 {(dim.weight * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="space-y-3 px-4 py-3">
                        {dim.rubrics.map((r) => (
                          <div key={r.id} className="space-y-1.5">
                            <span className="text-[11px] font-medium text-[#1a5632]">{r.id}</span>
                            <RubricField
                              label="检查点"
                              value={editedRubrics[`${r.id}.what_to_look_for`] || r.what_to_look_for}
                              onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_to_look_for`]: v }))}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <RubricField
                                label="Block 条件"
                                value={editedRubrics[`${r.id}.what_triggers_block`] || r.what_triggers_block}
                                onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_triggers_block`]: v }))}
                              />
                              <RubricField
                                label="Warn 条件"
                                value={editedRubrics[`${r.id}.what_triggers_warn`] || r.what_triggers_warn}
                                onChange={(v) => setEditedRubrics((p) => ({ ...p, [`${r.id}.what_triggers_warn`]: v }))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setDraft(null); handleGenerate(); }} className="gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" /> 重新生成
                  </Button>
                  <Button size="sm" onClick={handleConfirm} disabled={isConfirming} className={cn("gap-1", siteTheme.btnPrimary)}>
                    {isConfirming ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 确认中…</> : <><Check className="h-3.5 w-3.5" /> 确认评价标准</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ====== 子组件 ======

function NumberInput({
  question,
  prevAnswer,
  onNext,
  onPrev,
}: {
  question: SocraticQuestion;
  prevAnswer: string;
  onNext: (v: string) => void;
  onPrev?: () => void;
}) {
  const [value, setValue] = useState(prevAnswer);

  return (
    <div className="space-y-4">
      <div>
        <input
          type="number"
          min={1}
          max={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder}
          className="w-full rounded-lg border border-[#1a5632]/15 px-4 py-3 text-lg font-mono text-[#122820] focus:border-[#1a5632] focus:outline-none focus:ring-2 focus:ring-[#1a5632]/20"
          autoFocus
        />
      </div>
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

function FreeTextInput({
  question,
  prevAnswer,
  onNext,
  onPrev,
  optional,
}: {
  question: SocraticQuestion;
  prevAnswer: string;
  onNext: (v: string) => void;
  onPrev?: () => void;
  optional?: boolean;
}) {
  const [value, setValue] = useState(prevAnswer);

  return (
    <div className="space-y-4">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={question.placeholder}
        className="h-28 resize-none text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        {onPrev && (
          <Button variant="outline" size="sm" onClick={onPrev} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> 上一题
          </Button>
        )}
        {optional && (
          <Button variant="ghost" size="sm" onClick={() => onNext(value || "无")} className="text-xs">
            跳过
          </Button>
        )}
        <Button onClick={() => onNext(value || "无")} className={cn("gap-1.5 flex-1", siteTheme.btnPrimary)}>
          下一题 <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RubricField({
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
      <span className="text-[10px] text-[#9aa8a0]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-[#1a5632]/10 bg-[#f6f5f1]/50 px-2.5 py-1.5 text-[11px] text-[#3d4f46] resize-none focus:border-[#1a5632]/30 focus:outline-none"
        rows={2}
      />
    </div>
  );
}
