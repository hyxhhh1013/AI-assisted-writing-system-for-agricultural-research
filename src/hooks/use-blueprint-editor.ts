"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  parseWritingBlueprint,
  serializeWritingBlueprint,
  type WritingBlueprint,
} from "@/contracts/writing-blueprint";
import { normalizeBlueprintDraft } from "@/lib/blueprint-utils";

export function useBlueprintEditor(
  initial: WritingBlueprint | null,
  onPersist: (blueprint: WritingBlueprint) => void,
) {
  const [draft, setDraft] = useState<WritingBlueprint | null>(initial);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setIsDirty(false);
  }, [initial?.generatedAt, initial?.outlineHash]);

  const updateDraft = useCallback((updater: (prev: WritingBlueprint) => WritingBlueprint) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = normalizeBlueprintDraft(updater(prev));
      setIsDirty(true);
      return next;
    });
  }, []);

  const save = useCallback((): boolean => {
    if (!draft) return false;
    const raw = serializeWritingBlueprint(draft);
    if (!parseWritingBlueprint(raw)) {
      toast.error("蓝图格式无效，请检查必填项");
      return false;
    }
    onPersist(draft);
    setIsDirty(false);
    toast.success("写作蓝图已保存");
    return true;
  }, [draft, onPersist]);

  const reset = useCallback(() => {
    setDraft(initial);
    setIsDirty(false);
  }, [initial]);

  const requestClose = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm("有未保存的蓝图修改，确定离开吗？");
  }, [isDirty]);

  return {
    draft,
    isDirty,
    updateDraft,
    save,
    reset,
    requestClose,
    setDraft,
  };
}
