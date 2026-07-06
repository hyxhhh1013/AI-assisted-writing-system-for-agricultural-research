"use client";

import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AgentThoughtProps {
  text: string;
  defaultOpen?: boolean;
}

export function AgentThought({ text, defaultOpen = false }: AgentThoughtProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium">推理</span>
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2 whitespace-pre-wrap text-foreground/90">
          {text}
        </div>
      )}
    </div>
  );
}

interface AgentActionProps {
  tool: string;
  params: Record<string, unknown>;
  summary?: string;
  error?: string;
}

export function AgentActionCard({ tool, params, summary, error }: AgentActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-md border text-sm",
      error ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-background",
    )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Wrench className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-medium">{tool}</span>
        {summary && <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/40 px-3 py-2 text-xs">
          <pre className="overflow-x-auto rounded bg-muted/50 p-2">{JSON.stringify(params, null, 2)}</pre>
          {error && <p className="text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
