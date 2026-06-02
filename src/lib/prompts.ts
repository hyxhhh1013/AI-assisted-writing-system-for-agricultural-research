// Re-export from domain-split prompt modules
export {
  buildDomainExpertise,
  WRITING_SECTION_PROMPTS,
  resolveSectionPrompt,
  buildWriterSystemPrompt,
  buildVerifierSystemPrompt,
  buildVerifierPrompt,
  buildRefinerSystemPrompt,
  buildRefinerPrompt,
  buildOutlinePrompt,
  buildAnalysisPrompt,
  TRANSLATE_SYSTEM_PROMPT,
  buildTranslateUserPrompt,
  KNOWLEDGE_ANALYZE_SYSTEM,
  buildFullAnalysisPrompt,
  buildChunkAnalysisPrompt,
  buildConsistencyPrompt,
} from "./prompts/index";
