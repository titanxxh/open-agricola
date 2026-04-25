// client/services/llmService.ts
//
// Backwards-compat shim. The real LLM service lives in client/services/llm/.
// Existing consumers (AiCardDesigner.tsx, LocalizationModal.tsx) keep their
// import paths unchanged; new code SHOULD prefer importing from './llm'
// directly.
export * from './llm'
