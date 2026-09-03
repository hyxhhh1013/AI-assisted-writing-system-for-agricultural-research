"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AgentHitlBanner } from "@/components/shared/agent/agent-hitl-banner";

interface AgentClarifyCardProps {
  question: string;
  onSubmit: (answer: string) => void;
  onSkip: () => void;
}

export function AgentClarifyCard({ question, onSubmit, onSkip }: AgentClarifyCardProps) {
  const [answer, setAnswer] = useState("");

  return (
    <div className="rounded-xl border border-[#1a5632]/18 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(26,86,50,0.04)]">
      <AgentHitlBanner
        title="我需要你补充一点信息"
        detail="先回答这个问题，我再继续。不想现在定也可以先跳过。"
      />
      <blockquote className="mt-2 rounded-lg border border-[#1a5632]/12 bg-[#f6f8f6] px-3 py-2.5 text-[13px] leading-6 text-[#122820]">
        {question.trim() || "请确认一下再继续。"}
      </blockquote>
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="直接写你的决定或补充…"
        className="mt-2 min-h-[96px] resize-none bg-white text-xs"
      />
      <div className="mt-2 flex gap-2">
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
  );
}
