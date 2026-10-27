export type SoloHandGroupKind = 'occupation' | 'minor' | 'moor-minor'

export type SoloHandSelectionGroup = {
  kind: SoloHandGroupKind
  cardIds: string[]
  keepCount: number
}

export type SoloHandSelectionSubmission = {
  groups: Array<{ kind: SoloHandGroupKind; cardIds: string[] }>
}

/** Candidates survive confirmation for the single opening-selection history. */
export type SoloHandSelectionState = {
  playerId: string
  groups: SoloHandSelectionGroup[]
  kept: SoloHandSelectionSubmission | null
}
