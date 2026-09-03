// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  bumpEditorSyncEpoch,
  editorTextForSection,
  useEditorSync,
} from "@/hooks/use-editor-sync";
import type { ProjectData } from "@/contracts/project";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function project(over: Partial<ProjectData> = {}): ProjectData {
  return {
    id: "p1",
    title: "t",
    authors: "",
    affiliations: "",
    abstract: "",
    keywords: "",
    classification: "",
    researchDirection: "",
    outline: "",
    template: "gbt7713",
    mode: "review",
    language: "zh",
    sections: { introduction: "", background: "", literature_body: "", conclusion: "" },
    analysisResults: [],
    references: [],
    lastUpdated: 1,
    expandedOutlineSections: [],
    ...over,
  };
}

describe("editorTextForSection", () => {
  it("reads abstract vs body keys", () => {
    const p = project({ abstract: "摘", sections: { introduction: "引" } });
    expect(editorTextForSection(p, "abstract")).toBe("摘");
    expect(editorTextForSection(p, "introduction")).toBe("引");
  });
});

describe("useEditorSync", () => {
  it("does not overwrite a freshly persisted section with stale empty editor", () => {
    vi.useFakeTimers();
    const setProject = vi.fn();
    const epochRef = { current: 0 };
    const projectRef = {
      current: project({ sections: { introduction: "" } }),
    };

    renderHook(() =>
      useEditorSync("", "introduction", setProject, projectRef, epochRef),
    );

    act(() => {
      bumpEditorSyncEpoch(epochRef);
      projectRef.current = project({
        sections: { introduction: "刚写回的引言正文" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(setProject).not.toHaveBeenCalled();
  });

  it("still syncs user edits when epoch is unchanged", () => {
    vi.useFakeTimers();
    const setProject = vi.fn();
    const epochRef = { current: 0 };
    const projectRef = {
      current: project({ sections: { introduction: "" } }),
    };

    renderHook(() =>
      useEditorSync("用户刚改的引言", "introduction", setProject, projectRef, epochRef),
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(setProject).toHaveBeenCalled();
  });
});
