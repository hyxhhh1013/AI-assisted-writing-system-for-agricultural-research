export interface ConsistencyIssue {
  type: "terminology" | "data" | "logic" | "conclusion" | "citation" | "overclaim";
  severity: "high" | "medium" | "low";
  sections: string[];
  description: string;
  suggestion: string;
}

export interface ConsistencyReport {
  passed: boolean;
  issues: ConsistencyIssue[];
  summary: string;
}
