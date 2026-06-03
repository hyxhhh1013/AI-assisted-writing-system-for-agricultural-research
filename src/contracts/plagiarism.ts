export type PlagiarismRiskLevel = "high" | "medium" | "low";

export type PlagiarismMatchType = "self" | "cross" | "local" | "web" | "ai";

export interface PlagiarismMatchResult {
  id: string;
  sourceText: string;
  sourceOffset: number;
  matchType: PlagiarismMatchType;
  matchedText: string;
  matchedFrom: string;
  matchedUrl?: string;
  similarity: number;
  riskLevel: PlagiarismRiskLevel;
}

/** 与 page 内 CheckResult / MatchResult 对齐，供 UI 与 API 共享 */
export type MatchResult = PlagiarismMatchResult;
export type CheckResult = PlagiarismCheckResult;

export interface PlagiarismCheckStats {
  totalParagraphs: number;
  sampledParagraphs: number;
  selfMatches: number;
  crossMatches: number;
  knowledgeMatches: number;
  embeddingMatches: number;
  webMatches: number;
  clicheMatches: number;
  aiMatches: number;
  processingTime: number;
}

export interface PlagiarismCheckResult {
  checkId: string;
  totalMatches: number;
  maxSimilarity: number;
  overallRisk: PlagiarismRiskLevel;
  matches: PlagiarismMatchResult[];
  stats?: PlagiarismCheckStats;
}

export interface PlagiarismCheckRequest {
  projectId?: string;
  title: string;
  content: string;
  webSearch?: boolean;
}

export interface PlagiarismHistoryItem {
  id: string;
  title: string;
  status?: string;
  maxSimilarity: number;
  overallRisk: string;
  createdAt: string;
  _count?: { matches: number };
}

export interface PlagiarismCheckDetailRecord {
  id: string;
  title: string;
  status: string;
  maxSimilarity: number;
  overallRisk: string;
  createdAt: string;
  matches: PlagiarismMatchResult[];
  _count?: { matches: number };
}

export interface RewriteSuggestion {
  strategy: string;
  suggestedText: string;
  similarityAfter?: number;
  id?: string;
}

export interface RewriteMatchRequest {
  checkId: string;
  matchId: string;
  originalText: string;
  contextText?: string;
}

export interface RewriteSuggestionUpdateRequest {
  suggestionId: string;
  status: "accepted" | "rejected";
}

export type PlagiarismProgressStage =
  | "splitting"
  | "self_duplication"
  | "cross_project"
  | "knowledge_base"
  | "embedding_semantic"
  | "web_search"
  | "academic_cliche"
  | "ai_assessment"
  | "saving"
  | "done";

export interface PlagiarismProgressEvent {
  type: "progress";
  stage: PlagiarismProgressStage;
  message: string;
}

export interface PlagiarismCheckDoneEvent {
  type: "done";
  data: PlagiarismCheckResult;
}

export interface PlagiarismCheckErrorEvent {
  type: "error";
  message: string;
}

export type PlagiarismCheckStreamEvent =
  | PlagiarismProgressEvent
  | PlagiarismCheckDoneEvent
  | PlagiarismCheckErrorEvent;
