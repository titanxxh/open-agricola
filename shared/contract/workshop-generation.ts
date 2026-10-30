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

export type GenerationResult = {
  kind: 'candidate' | 'failed-source' | 'answer' | 'failure' | 'interrupted'
  attemptId: string
  createdAt: number
  message: string
  provenance?: GenerationProvenance
  /** Successful source is stored once, in ability.lastValid. */
  candidateId?: string
  sourceFingerprint?: string
  /** Complete artifacts which failed source validation or browser tests. */
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
  format: 2
  id: string
  runtime: 'server-isolated-vm'
  limits: { executionTimeoutMs: number; memoryLimitMb: number }
  effects: readonly string[]
  listeners: {
    actions: readonly string[]
    phases: readonly string[]
    scopes: readonly string[]
    /** Keys of the player objects in the deployed listener context; IDs live inside them. */
    players: { actor: string; owner: string; effectRecipient: string }
  }
  actions: readonly string[]
}
