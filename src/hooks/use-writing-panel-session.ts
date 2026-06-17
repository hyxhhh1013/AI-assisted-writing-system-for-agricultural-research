"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const WRITING_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const writingSessionKey = (projectId: string) => `agri_ai_writing_session_${projectId}`;

export interface PersistedWritingSession {
  version: 1;
  updatedAt: number;
  title: string;
  selectedSectionId: string;
  targetSectionKey: string;
  context: string;
  bullets?: string[];
  result: string;
  verificationFeedback: string;
  generationStatus: string;
  detectedRefs: string[];
  wasGenerating: boolean;
}

export interface WritingPanelSessionState {
  title: string;
  selectedSectionId: string;
  targetSectionKey: string;
  context: string;
  bullets?: string[];
  result: string;
  verificationFeedback: string;
  generationStatus: string;
  detectedRefs: string[];
  isGenerating: boolean;
}

export interface WritingPanelSessionSetters {
  setTitle: (v: string) => void;
  setSelectedSectionId: (v: string) => void;
  setTargetSectionKey: (v: string) => void;
  setContext: (v: string) => void;
  setBullets?: (v: string[]) => void;
  setResult: (v: string) => void;
  setVerificationFeedback: (v: string) => void;
  setGenerationStatus: (v: import("@/components/shared/writing/writing-types").GenerationStatus) => void;
  setDetectedRefs: (v: string[]) => void;
  setIsGenerating: (v: boolean) => void;
}

interface UseWritingPanelSessionParams {
  projectId: string;
  templateSectionIds: Set<string>;
  state: WritingPanelSessionState;
  setters: WritingPanelSessionSetters;
}

export function useWritingPanelSession({
  projectId,
  templateSectionIds,
  state,
  setters,
}: UseWritingPanelSessionParams) {
  const restoredRef = useRef(false);

  useEffect(() => {
    restoredRef.current = false;
    if (!projectId) return;
    try {
      const raw = sessionStorage.getItem(writingSessionKey(projectId));
      if (!raw) {
        restoredRef.current = true;
        return;
      }
      const s = JSON.parse(raw) as Partial<PersistedWritingSession>;
      if (s.version !== 1 || typeof s.updatedAt !== "number") {
        restoredRef.current = true;
        return;
      }
      if (Date.now() - s.updatedAt > WRITING_SESSION_MAX_AGE_MS) {
        sessionStorage.removeItem(writingSessionKey(projectId));
        restoredRef.current = true;
        return;
      }
      if (typeof s.title === "string") setters.setTitle(s.title);
      if (typeof s.selectedSectionId === "string") setters.setSelectedSectionId(s.selectedSectionId);
      if (typeof s.targetSectionKey === "string" && templateSectionIds.has(s.targetSectionKey)) {
        setters.setTargetSectionKey(s.targetSectionKey);
      }
      if (typeof s.context === "string") setters.setContext(s.context);
      if (Array.isArray(s.bullets) && setters.setBullets) setters.setBullets(s.bullets);
      if (typeof s.result === "string") setters.setResult(s.result);
      if (typeof s.verificationFeedback === "string") setters.setVerificationFeedback(s.verificationFeedback);
      if (s.generationStatus) {
        setters.setGenerationStatus(
          s.generationStatus as import("@/components/shared/writing/writing-types").GenerationStatus,
        );
      }
      if (Array.isArray(s.detectedRefs)) setters.setDetectedRefs(s.detectedRefs);
      if (s.wasGenerating) {
        setters.setIsGenerating(false);
        if (s.generationStatus && s.generationStatus !== "completed") {
          setters.setGenerationStatus("idle");
        }
        toast.info("上次扩写未在页面内跑完，已恢复已生成的内容；需要完整核查与修正请重新点击扩写。");
      }
    } catch {
      /* ignore */
    }
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 projectId 变化时恢复一次
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !restoredRef.current) return;
    const t = window.setTimeout(() => {
      try {
        const payload: PersistedWritingSession = {
          version: 1,
          updatedAt: Date.now(),
          title: state.title,
          selectedSectionId: state.selectedSectionId,
          targetSectionKey: state.targetSectionKey,
          context: state.context,
          bullets: state.bullets,
          result: state.result,
          verificationFeedback: state.verificationFeedback,
          generationStatus: state.generationStatus,
          detectedRefs: state.detectedRefs,
          wasGenerating: state.isGenerating,
        };
        sessionStorage.setItem(writingSessionKey(projectId), JSON.stringify(payload));
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [projectId, state]);

  return { restoredRef, clearSession: () => {
    try {
      sessionStorage.removeItem(writingSessionKey(projectId));
    } catch {
      /* ignore */
    }
  } };
}
