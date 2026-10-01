"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AgentHitlBanner } from "@/components/shared/agent/agent-hitl-banner";
import { AgentMarkdown } from "@/components/shared/agent/agent-thought";
import {
  formatChoicePrompt,
  parseChoicePrompt,
} from "@/lib/agent/choice-prompt-display";
import { isolateClarifyQuestion } from "@/lib/agent/split-exec-summary";

export { formatChoicePrompt } from "@/lib/agent/choice-prompt-display";

interface AgentClarifyCardProps {
  question: string;
  onSubmit: (answer: string) => void;
  onSkip: () => void;
}

function ChoicePromptBody({ question }: { question: string }) {
  const parsed = parseChoicePrompt(question);
  if (parsed) {
    return (
      <div className="space-y-2 text-[13px] leading-6 text-[#122820]">
        {parsed.lead ? (
          <p className="font-semibold text-[#122820]">{parsed.lead}</p>
        ) : null}
        <ol className="my-0 list-decimal space-y-1.5 pl-5">
          {parsed.options.map((opt) => (
            <li key={opt} className="pl-0.5">
              {opt}
            </li>
          ))}
        </ol>
        {parsed.tail ? (
          <p className="text-[12px] text-[#3d4f46]">{parsed.tail}</p>
        ) : null}
      </div>
    );
  }
  return (
    <AgentMarkdown
      content={formatChoicePrompt(question)}
      className="text-[13px] leading-6 text-[#122820] prose-p:my-1 prose-ol:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-[#122820]"
    />
  );
}

export function AgentClarifyCard({ question, onSubmit, onSkip }: AgentClarifyCardProps) {
  const [answer, setAnswer] = useState("");
  const displayQuestion = isolateClarifyQuestion(question);
  const parsed = parseChoicePrompt(displayQuestion);
  const quickReplies =
    parsed && parsed.options.length >= 2 && parsed.options.length <= 5
      ? parsed.options.map((_, i) => String(i + 1))
      : null;

  return (
    <div className="flex max-h-[min(52vh,28rem)] min-h-0 flex-col rounded-xl border border-[#1a5632]/18 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(26,86,50,0.04)]">
      <AgentHitlBanner
        title="我需要你补充一点信息"
        detail="先回答这个问题，我再继续。不想现在定也可以先跳过。"
      />
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#1a5632]/12 bg-[#f6f8f6] px-3 py-2.5">
        <ChoicePromptBody question={displayQuestion} />
      </div>
      <div className="mt-2 shrink-0 space-y-2">
        {quickReplies ? (
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 min-w-[2rem] px-2.5 text-xs"
                onClick={() => {
                  onSubmit(n);
                  setAnswer("");
                }}
              >
                {n}
              </Button>
            ))}
          </div>
        ) : null}
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="直接写你的决定或补充…"
          className="min-h-[72px] resize-none bg-white text-xs"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => {
              onSubmit(answer.trim());
              setAnswer("");
            }}
          >
            回答后继续
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setAnswer("");
              onSkip();
            }}
          >
            先跳过
          </Button>
        </div>
      </div>
    </div>
  );
}
