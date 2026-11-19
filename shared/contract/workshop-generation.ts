import type { WorkshopAbilityCandidateContract } from './workshop'

/** Durable, author-private summaries. Provider envelopes belong only in page memory. */
export type GenerationUsage = {
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
}

export type GenerationReference = {
  path: string
  startLine: number
  endLine: number
  url: string
}

export type GenerationProvenance = {
  attemptId: string
  inputFingerprint: string
  sourceFingerprint?: string
  referenceCommit?: string
  sandboxContractId?: string
  promptVersion: string
  toolVersion: string
  provider: string
  endpoint: string
  model: string
  returnedModel?: string
  modelRequests: number
  referenceCalls: number
  elapsedMs: number
  usage: GenerationUsage
  references: GenerationReference[]
}

export const FEASIBILITY_VERDICTS = ['feasible', 'needs-info', 'needs-platform'] as const
export type FeasibilityVerdict = typeof FEASIBILITY_VERDICTS[number]

/** The model's researched verdict on whether the card closes over existing mechanisms (ADR 0052). */
export type GenerationFeasibility = {
  verdict: FeasibilityVerdict
  summary: string
  /** Code or docs the verdict rests on. */
  evidence: { path: string; finding: string }[]
  /** Shared mechanisms the card would need; set for needs-platform. */
  gaps: string[]
  /** Rule questions for the author; set for needs-info. */
  questions: string[]
}

export type GenerationResult = {
  kind: 'candidate' | 'failed-source' | 'answer' | 'needs-info' | 'needs-platform' | 'failure' | 'interrupted'
  attemptId: string
  createdAt: number
  message: string
  provenance?: GenerationProvenance
  /** Successful source is stored once, in ability.lastValid. */
  candidateId?: string
  sourceFingerprint?: string
  /** Complete artifacts which failed source validation or browser tests. */
  failedCandidate?: WorkshopAbilityCandidateContract
  feasibility?: GenerationFeasibility
}

export type WorkshopVisibleMessage = {
  role: 'user' | 'assistant'
  content: string
  attemptId?: string
  streaming?: boolean
  isError?: boolean
  interrupted?: boolean
}

export type WorkshopSandboxContract = {
  format: 2
  /** Identifies the deployed source; validation results are bound to it. */
  id: string
  /** Workshop code runs only as a Card Source module in the author's browser (ADR 0052). */
  runtime: 'browser-card-source'
}
