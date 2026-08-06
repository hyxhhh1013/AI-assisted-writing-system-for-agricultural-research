"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  createStudioSession,
  createInitialPhaseStatus,
  createInitialCheckpoints,
  createEmptyConfig,
  type LinkedProject,
  type OperationalMode,
  type PaperConfigurationRecord,
  type PhaseStatus,
  type StudioPhase,
  type StudioSession,
  getMode,
  confirmConfig,
  approveOutline,
  skipLiterature,
  advanceAfterPhaseDone,
  recordReviewRound,
  studioConfigToPassport,
  WORD_COUNT_DEFAULTS,
} from "../flow";
import { patchPaperPassportConfig } from "@/services/project";

const STORAGE_KEY = "academic-paper-studio:v1";

/** SSR / 首屏占位：禁止 Date.now()，避免 hydration mismatch */
const BOOT_SESSION: StudioSession = {
  version: 1,
  id: "aps_boot",
  createdAt: 0,
  updatedAt: 0,
  screen: "welcome",
  mode: null,
  intakeStepIndex: 0,
  config: createEmptyConfig(),
  currentPhase: 0,
  phaseStatus: createInitialPhaseStatus(),
  checkpoints: createInitialCheckpoints(),
  artifacts: {},
  linkedProject: null,
  planModeAnswers: { topic: "", materials: "", structurePreference: "" },
};

const emptySubscribe = () => () => {};

function loadSession(): StudioSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createStudioSession();
    const parsed = JSON.parse(raw) as Partial<StudioSession>;
    if (parsed?.version !== 1) return createStudioSession();
    return {
      ...BOOT_SESSION,
      ...parsed,
      version: 1,
      id: typeof parsed.id === "string" && parsed.id !== "aps_boot"
        ? parsed.id
        : createStudioSession().id,
      linkedProject: parsed.linkedProject ?? null,
      checkpoints: { ...BOOT_SESSION.checkpoints, ...parsed.checkpoints },
      phaseStatus: { ...BOOT_SESSION.phaseStatus, ...parsed.phaseStatus },
      config: { ...BOOT_SESSION.config, ...parsed.config },
      planModeAnswers: {
        ...BOOT_SESSION.planModeAnswers,
        ...parsed.planModeAnswers,
      },
      artifacts: parsed.artifacts ?? {},
    };
  } catch {
    return createStudioSession();
  }
}

export function useStudioSession() {
  // 服务端 false / 客户端 true，React 官方允许的「有意不一致」
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [session, setSession] = useState<StudioSession>(BOOT_SESSION);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    setSession(loadSession());
    setSessionReady(true);
  }, [mounted]);

  useEffect(() => {
    if (!sessionReady) return;
    if (session.id === "aps_boot") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session, sessionReady]);

  const patch = useCallback((updater: (prev: StudioSession) => StudioSession) => {
    setSession((prev) => {
      const next = updater(prev);
      return { ...next, updatedAt: Date.now() };
    });
  }, []);

  const reset = useCallback(() => {
    const fresh = createStudioSession();
    setSession(fresh);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectMode = useCallback(
    (mode: OperationalMode) => {
      patch((prev) => {
        const def = getMode(mode);
        const phaseStatus = createInitialPhaseStatus();
        for (const p of def.phases) {
          phaseStatus[p] = p === def.phases[0] ? "ready" : "locked";
        }
        const skipIntake =
          mode === "revision-coach"
          || mode === "citation-check"
          || mode === "format-convert"
          || mode === "disclosure";

        return {
          ...prev,
          mode,
          screen: skipIntake ? "pipeline" : "intake",
          intakeStepIndex: 0,
          currentPhase: def.phases[0] ?? 0,
          phaseStatus,
          config: {
            ...prev.config,
            operationalMode: mode,
          },
          checkpoints: {
            ...prev.checkpoints,
            configConfirmed: skipIntake,
            outlineApproved:
              mode === "revision"
              || mode === "revision-coach"
              || mode === "abstract-only"
              || mode === "citation-check"
              || mode === "format-convert"
              || mode === "disclosure",
          },
        };
      });
    },
    [patch],
  );

  const updateConfig = useCallback(
    (partial: Partial<PaperConfigurationRecord>) => {
      patch((prev) => ({
        ...prev,
        config: { ...prev.config, ...partial },
      }));
    },
    [patch],
  );

  const setIntakeStep = useCallback(
    (index: number) => {
      patch((prev) => ({ ...prev, intakeStepIndex: Math.max(0, index) }));
    },
    [patch],
  );

  const goScreen = useCallback(
    (screen: StudioSession["screen"]) => {
      patch((prev) => ({ ...prev, screen }));
    },
    [patch],
  );

  const finishIntake = useCallback(() => {
    patch((prev) => ({
      ...prev,
      screen: "config-confirm",
      phaseStatus: { ...prev.phaseStatus, 0: "awaiting_confirm" },
    }));
  }, [patch]);

  const confirmConfiguration = useCallback(async () => {
    const current = session;
    const projectId = current.linkedProject?.id ?? null;
    const passportPayload = studioConfigToPassport(current.config);

    patch((prev) => {
      const checkpoints = confirmConfig(prev.checkpoints);
      const phaseStatus: Record<StudioPhase, PhaseStatus> = {
        ...prev.phaseStatus,
        0: "done",
      };
      const mode = prev.mode!;
      const phases = getMode(mode).phases;
      const nextPhase = (phases.find((p) => p > 0) ?? 0) as StudioPhase;
      if (phaseStatus[nextPhase] === "locked") phaseStatus[nextPhase] = "ready";
      if (checkpoints.skipLiterature && nextPhase === 1) {
        phaseStatus[1] = "skipped";
        if (phases.includes(2)) phaseStatus[2] = "ready";
      }
      return {
        ...prev,
        checkpoints: { ...checkpoints, configConfirmed: true },
        phaseStatus,
        currentPhase: checkpoints.skipLiterature && phases.includes(2) ? 2 : nextPhase,
        screen: "pipeline",
        config: {
          ...prev.config,
          confirmedAt: Date.now(),
        },
      };
    });

    if (projectId) {
      try {
        await patchPaperPassportConfig(projectId, passportPayload);
      } catch {
        // 本地流水线已进入；同步失败不阻断
      }
    }
  }, [patch, session]);

  /** 跳过长访谈：用项目标题填最低配置，直接进流水线 */
  const skipIntakeToPipeline = useCallback(async () => {
    patch((prev) => {
      const title = prev.linkedProject?.title?.trim() || (prev.config.topic ?? "").trim() || "未命名论文";
      const paperType = prev.config.paperType || "imrad";
      return {
        ...prev,
        config: {
          ...prev.config,
          topic: title,
          paperType,
          discipline: prev.config.discipline || "农业科学",
          citationFormat: prev.config.citationFormat || "apa7",
          outputFormat: prev.config.outputFormat || "docx",
          bodyLanguage: prev.config.bodyLanguage || "en",
          abstractLanguage: prev.config.abstractLanguage || "bilingual",
          wordCountTarget: prev.config.wordCountTarget || WORD_COUNT_DEFAULTS[paperType],
          domainEvidenceProfile: prev.config.domainEvidenceProfile || "unknown_user_defined",
          citationVerification: prev.config.citationVerification || "advisory",
        },
        screen: "config-confirm",
        phaseStatus: { ...prev.phaseStatus, 0: "awaiting_confirm" },
      };
    });
  }, [patch]);

  const openPhase = useCallback(
    (phase: StudioPhase) => {
      patch((prev) => ({
        ...prev,
        currentPhase: phase,
        screen: "phase",
        phaseStatus: {
          ...prev.phaseStatus,
          [phase]:
            prev.phaseStatus[phase] === "done"
              ? "done"
              : prev.phaseStatus[phase] === "ready"
                || prev.phaseStatus[phase] === "in_progress"
                ? "in_progress"
                : prev.phaseStatus[phase],
        },
      }));
    },
    [patch],
  );

  const completePhase = useCallback(
    (phase: StudioPhase) => {
      patch((prev) => {
        const advanced = advanceAfterPhaseDone(prev, phase);
        return {
          ...prev,
          ...advanced,
          screen: "pipeline",
        };
      });
    },
    [patch],
  );

  const doApproveOutline = useCallback(() => {
    patch((prev) => ({
      ...prev,
      checkpoints: approveOutline(prev.checkpoints),
    }));
  }, [patch]);

  const doSkipLiterature = useCallback(() => {
    patch((prev) => {
      const checkpoints = skipLiterature(prev.checkpoints);
      const phaseStatus = { ...prev.phaseStatus, 1: "skipped" as const };
      if (prev.mode && getMode(prev.mode).phases.includes(2)) {
        phaseStatus[2] = "ready";
      }
      return {
        ...prev,
        checkpoints,
        phaseStatus,
        currentPhase: 2,
        screen: "pipeline",
      };
    });
  }, [patch]);

  const doRecordReview = useCallback(
    (verdict: StudioSession["checkpoints"]["reviewVerdict"], criticalBlocking: boolean) => {
      patch((prev) => ({
        ...prev,
        checkpoints: recordReviewRound(prev.checkpoints, verdict, criticalBlocking),
      }));
    },
    [patch],
  );

  const updatePlanAnswers = useCallback(
    (partial: Partial<StudioSession["planModeAnswers"]>) => {
      patch((prev) => ({
        ...prev,
        planModeAnswers: { ...prev.planModeAnswers, ...partial },
        config: {
          ...prev.config,
          topic: partial.topic ?? prev.config.topic,
          researchQuestion: partial.materials ?? prev.config.researchQuestion,
        },
      }));
    },
    [patch],
  );

  const setLinkedProject = useCallback(
    (project: LinkedProject | null) => {
      patch((prev) => ({ ...prev, linkedProject: project }));
    },
    [patch],
  );

  return {
    session,
    hydrated: mounted && sessionReady,
    reset,
    selectMode,
    updateConfig,
    setIntakeStep,
    goScreen,
    finishIntake,
    confirmConfiguration,
    skipIntakeToPipeline,
    openPhase,
    completePhase,
    doApproveOutline,
    doSkipLiterature,
    doRecordReview,
    updatePlanAnswers,
    setLinkedProject,
    patch,
  };
}

export type StudioController = ReturnType<typeof useStudioSession>;
