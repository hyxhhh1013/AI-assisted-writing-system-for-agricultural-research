import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";
import { getErrorMessage } from "@/lib/error-utils";

export async function generateArgumentBlueprint(input: {
  title: string;
  outline: string;
  language?: "zh" | "en";
  thesisHint?: string;
  writingBlueprintThesis?: string;
}): Promise<ArgumentBlueprint> {
  const res = await fetch("/api/outline/argument-blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(getErrorMessage(body) || "论证蓝图生成失败");
  }
  return res.json();
}

export async function saveArgumentBlueprint(
  projectId: string,
  blueprint: ArgumentBlueprint,
): Promise<{ argumentBlueprint: ArgumentBlueprint }> {
  const res = await fetch(`/api/projects/${projectId}/argument-blueprint`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(blueprint),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(getErrorMessage(body) || "保存论证蓝图失败");
  }
  return res.json();
}
