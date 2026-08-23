import type { MechanismQaReport } from "@/contracts/mechanism-qa";

export function MechanismQaBanner({
  report,
  patchCount = 0,
}: {
  report?: MechanismQaReport;
  patchCount?: number;
}) {
  if (!report && patchCount <= 0) return null;
  const verdict = report?.verdict ?? "pass";
  const findings = report?.findings ?? [];
  const tone =
    verdict === "block"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : verdict === "repair"
        ? "border-amber-400/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-border bg-muted/40 text-muted-foreground";
  const label =
    verdict === "block" ? "未过线" : verdict === "repair" ? "已改 Spec" : "结构通过";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-snug ${tone}`}>
      <div className="font-medium">
        机理质检 {label}
        {patchCount > 0 ? ` · 补丁 ${patchCount}` : ""}
      </div>
      {findings.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {findings.slice(0, 4).map((f) => (
            <li key={`${f.code}-${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
