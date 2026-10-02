export type WorkshopCardType = 'minor' | 'occupation'

export type WorkshopDraftErrorCode =
  | 'conflict'
  | 'live_edit_blocked'
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'not_ready'

export type WorkshopDraftContract = {
  cardId: string
  cardType: WorkshopCardType
  name: string
  description: string
  cardJson: Record<string, unknown>
  effectCode: string | null
  compiledCode?: string | null
  codeManifest?: Record<string, unknown> | null
  artUrl: string | null
  generation: Record<string, unknown>
}

export type WorkshopReviewStatus = 'unsubmitted' | 'in_review' | 'approved' | 'stale' | 'merged'

export type WorkshopWorkspaceContract = {
  id: string
  authorId: string
  revision: number
  reviewStatus: WorkshopReviewStatus
  live: boolean
  draft: WorkshopDraftContract
  approvedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
}

export type WorkshopGenerationCandidateBase = {
  id: string
  prompt: string
  provider?: string
  model?: string
  createdAt: number
}

export type WorkshopArtCandidateContract = WorkshopGenerationCandidateBase & {
  kind: 'art'
  resultUrl: string
  promptFormat?: 'subject'
  referenceImages?: string[]
}

export type WorkshopAbilityCandidateContract = WorkshopGenerationCandidateBase & {
  kind: 'ability'
  sourceCode: string
  cardJson: Record<string, unknown>
  validation: { valid: boolean; errors?: string[] }
}
