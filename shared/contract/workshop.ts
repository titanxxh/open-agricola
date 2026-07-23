export type WorkshopCardType = 'minor' | 'occupation'

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

export type WorkshopWorkspaceContract = {
  id: string
  authorId: string
  revision: number
  status: string
  draft: WorkshopDraftContract
  publishedVersionId: string | null
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
  referenceImages?: string[]
}

export type WorkshopAbilityCandidateContract = WorkshopGenerationCandidateBase & {
  kind: 'ability'
  sourceCode: string
  validation: { valid: boolean; errors?: string[] }
}
