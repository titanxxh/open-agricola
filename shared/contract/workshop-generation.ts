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
  repairs: number
  elapsedMs: number
  usage: GenerationUsage
  references: GenerationReference[]
}

export type GenerationResult = {
  kind: 'candidate' | 'failed-source' | 'clarification' | 'capability-gap' | 'failure' | 'interrupted'
  attemptId: string
  createdAt: number
  message: string
  provenance?: GenerationProvenance
  /** Successful source is stored once, in ability.lastValid. */
  candidateId?: string
  sourceFingerprint?: string
  /** Only a complete source which failed validation is embedded here. */
  failedCandidate?: WorkshopAbilityCandidateContract
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
  format: 1
  id: string
  runtime: 'server-isolated-vm'
  limits: { executionTimeoutMs: number; memoryLimitMb: number }
  effects: Record<string, unknown>
  listeners: { actions: readonly string[]; phases: Record<string, unknown>; scopes: readonly string[] }
  actions: Record<string, { desc: string; params: string }>
  helpers: string
  semantics: readonly string[]
}
