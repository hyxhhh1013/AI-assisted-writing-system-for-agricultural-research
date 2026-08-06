/**
 * academic-paper skill 对齐类型（可视化工作室）
 * 来源：academic-paper/SKILL.md + workflow_phase_details.md + intake_agent.md
 */

export type OperationalMode =
  | "full"
  | "outline-only"
  | "plan"
  | "revision"
  | "revision-coach"
  | "abstract-only"
  | "lit-review"
  | "format-convert"
  | "citation-check"
  | "disclosure";

/** skill 主轴 Phase 0–7；Phase 5 内含 5a/5b 并行轨 */
export type StudioPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PhaseStatus = "locked" | "ready" | "in_progress" | "awaiting_confirm" | "done" | "skipped";

export type PaperType =
  | "imrad"
  | "literature_review"
  | "theoretical"
  | "case_study"
  | "policy_brief"
  | "conference";

export type CitationFormat = "apa7" | "chicago" | "mla" | "ieee" | "vancouver";

export type OutputFormat = "markdown" | "latex" | "docx" | "pdf" | "combined";

export type BodyLanguage = "en" | "zh-TW" | "bilingual";

export type AbstractLanguage = "bilingual" | "en-only" | "zh-TW-only";

export type DomainEvidenceProfile =
  | "general_social_science"
  | "cs_ml"
  | "humanities_interpretive"
  | "unknown_user_defined";

export type CitationVerificationLevel = "advisory" | "strict";

export type ReviewVerdict = "accept" | "minor" | "major" | "reject" | null;

export interface ExistingMaterials {
  researchQuestion: boolean;
  literature: boolean;
  data: boolean;
  draftSections: boolean;
  reviewerFeedback: boolean;
  styleGuide: boolean;
}

export interface CoAuthorInfo {
  mode: "single" | "multi";
  count: number;
  correspondingAuthor: string;
  notes: string;
}

export interface FundingInfo {
  funded: boolean;
  agency: string;
  grantNumber: string;
  role: string;
  coi: string;
}

/** Paper Configuration Record — Phase 0 产出，进入 Phase 1 前必须确认 */
export interface PaperConfigurationRecord {
  topic: string;
  researchQuestion: string;
  paperType: PaperType;
  discipline: string;
  targetJournal: string;
  citationFormat: CitationFormat;
  outputFormat: OutputFormat;
  bodyLanguage: BodyLanguage;
  abstractLanguage: AbstractLanguage;
  wordCountTarget: number;
  existingMaterials: ExistingMaterials;
  coAuthors: CoAuthorInfo;
  funding: FundingInfo;
  styleProfileAttached: boolean;
  domainEvidenceProfile: DomainEvidenceProfile;
  domainEvidenceRequested?: string;
  citationVerification: CitationVerificationLevel;
  operationalMode: OperationalMode;
  notes: string;
  confirmedAt: number | null;
}

export interface PhaseArtifact {
  id: string;
  title: string;
  summary: string;
  updatedAt: number;
}

export interface CheckpointState {
  configConfirmed: boolean;
  outlineApproved: boolean;
  sourcesReviewed: boolean;
  skipLiterature: boolean;
  revisionRound: number;
  reviewVerdict: ReviewVerdict;
  criticalIssuesBlocking: boolean;
}

export type StudioScreen =
  | "welcome"
  | "mode"
  | "intake"
  | "config-confirm"
  | "pipeline"
  | "phase";

export interface LinkedProject {
  id: string;
  title: string;
}

export interface StudioSession {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  screen: StudioScreen;
  mode: OperationalMode | null;
  intakeStepIndex: number;
  config: PaperConfigurationRecord;
  currentPhase: StudioPhase;
  phaseStatus: Record<StudioPhase, PhaseStatus>;
  checkpoints: CheckpointState;
  artifacts: Partial<Record<StudioPhase | "5a" | "5b", PhaseArtifact[]>>;
  /** 浅接：绑定到禾书耕文项目，用于跳转工作台 */
  linkedProject: LinkedProject | null;
  /** plan 模式仅 3 问 */
  planModeAnswers: {
    topic: string;
    materials: string;
    structurePreference: string;
  };
}

export function createEmptyConfig(): PaperConfigurationRecord {
  return {
    topic: "",
    researchQuestion: "",
    paperType: "imrad",
    discipline: "农业科学",
    targetJournal: "General",
    citationFormat: "apa7",
    outputFormat: "markdown",
    bodyLanguage: "zh-TW",
    abstractLanguage: "bilingual",
    wordCountTarget: 6000,
    existingMaterials: {
      researchQuestion: false,
      literature: false,
      data: false,
      draftSections: false,
      reviewerFeedback: false,
      styleGuide: false,
    },
    coAuthors: {
      mode: "single",
      count: 1,
      correspondingAuthor: "",
      notes: "",
    },
    funding: {
      funded: false,
      agency: "",
      grantNumber: "",
      role: "",
      coi: "无利益冲突",
    },
    styleProfileAttached: false,
    domainEvidenceProfile: "unknown_user_defined",
    citationVerification: "advisory",
    operationalMode: "full",
    notes: "",
    confirmedAt: null,
  };
}

export function createInitialCheckpoints(): CheckpointState {
  return {
    configConfirmed: false,
    outlineApproved: false,
    sourcesReviewed: false,
    skipLiterature: false,
    revisionRound: 0,
    reviewVerdict: null,
    criticalIssuesBlocking: false,
  };
}

export function createInitialPhaseStatus(): Record<StudioPhase, PhaseStatus> {
  return {
    0: "ready",
    1: "locked",
    2: "locked",
    3: "locked",
    4: "locked",
    5: "locked",
    6: "locked",
    7: "locked",
  };
}

export function createStudioSession(partial?: Partial<StudioSession>): StudioSession {
  const now = Date.now();
  return {
    version: 1,
    id: `aps_${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
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
    ...partial,
  };
}
