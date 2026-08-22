import { describe, expect, it } from "vitest";
import { liftAgentChartExtras } from "@/lib/chart-spec-extras";

describe("liftAgentChartExtras", () => {
  it("keeps significance and strips figsize / dpi / tight_layout", () => {
    const lifted = liftAgentChartExtras({
      configJson: JSON.stringify({
        significance: [{ category: 0, value: "**" }],
        fig_width: 12,
        dpi: 72,
        tight_layout: true,
        style: { font_size: 4 },
      }),
    });
    expect(lifted.error).toBeUndefined();
    expect(lifted.extras.significance).toEqual([{ category: 0, value: "**" }]);
    expect(lifted.extras).not.toHaveProperty("fig_width");
    expect(lifted.dropped.sort()).toEqual(["dpi", "fig_width", "style", "tight_layout"].sort());
  });

  it("lets significanceJson override configJson.significance", () => {
    const lifted = liftAgentChartExtras({
      configJson: JSON.stringify({ significance: [{ category: 0, value: "*" }] }),
      significanceJson: JSON.stringify([{ fromCategory: 0, toCategory: 1, value: "**" }]),
    });
    expect(lifted.extras.significance).toEqual([{ fromCategory: 0, toCategory: 1, value: "**" }]);
  });

  it("rejects invalid configJson", () => {
    const lifted = liftAgentChartExtras({ configJson: "{not json" });
    expect(lifted.error).toMatch(/JSON/);
  });
});
