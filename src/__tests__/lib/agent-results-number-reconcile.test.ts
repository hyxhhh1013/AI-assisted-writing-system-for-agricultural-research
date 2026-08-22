import { describe, expect, it } from "vitest";
import type { EvidenceClaim } from "@/contracts/data-source";
import { reconcileResultsNumbers } from "@/lib/agent/results-number-reconcile";

const claim34: EvidenceClaim = {
  id: "D1-C1",
  sourceId: "D1",
  sourceType: "data",
  type: "mean",
  text: "处理组均值 3.4",
  values: { mean: 3.4 },
  variables: ["yield"],
  tolerance: 5,
};

describe("reconcileResultsNumbers", () => {
  it("正文写 3.4 通过对账", () => {
    const r = reconcileResultsNumbers("产量为 3.4 g，见 [D1-C1]。", [claim34]);
    expect(r.ok).toBe(true);
  });

  it("正文写 9.9 拒写", () => {
    const r = reconcileResultsNumbers("产量高达 9.9 g。", [claim34]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.offenders.some((o) => o.raw === "9.9")).toBe(true);
      expect(r.message).toMatch(/9\.9/);
    }
  });

  it("约/数量级灰区不拦", () => {
    expect(reconcileResultsNumbers("产量约为 9.9 g。", [claim34]).ok).toBe(true);
    expect(reconcileResultsNumbers("数量级在 9.9 左右。", [claim34]).ok).toBe(true);
  });

  it("整数不拦（只拦精确小数）", () => {
    expect(reconcileResultsNumbers("共 12 个处理。", [claim34]).ok).toBe(true);
  });

  it("图/表号和 p 值不拦", () => {
    expect(reconcileResultsNumbers("见图 2.1 与表 3.2。", [claim34]).ok).toBe(true);
    expect(reconcileResultsNumbers("差异显著（p = 0.05）。", [claim34]).ok).toBe(true);
  });
});
