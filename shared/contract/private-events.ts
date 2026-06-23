import type { DraftPickPayload } from '../draft/types'

export type PrivatePromptShownEvent = {
  schemaVersion: 1
  type: 'private.promptShown'
  recipientPlayerId: string
  promptKind: string
  sourceCard?: string
  sourceActionId?: string
  promptKey?: string
}

export type PrivateHandChangedEvent = {
  schemaVersion: 1
  type: 'private.handChanged'
  recipientPlayerId: string
  cardIds: string[]
  cardType: 'minor' | 'occupation' | 'mixed'
  reason: 'dev-draw-card' | 'draft-finalized' | 'card-effect'
  sourceCard?: string
  sourceActionId?: string
}

export type PrivateDraftUpdatedEvent = {
  schemaVersion: 1
  type: 'private.draftUpdated'
  recipientPlayerId: string
  round: number
  totalRounds: number
  picked?: DraftPickPayload
  poolCounts: { occ: number; minor: number }
  keptCounts: { occ: number; minor: number }
  advanced: boolean
  finished: boolean
}

export type PrivateGameEvent =
  | PrivatePromptShownEvent
  | PrivateHandChangedEvent
  | PrivateDraftUpdatedEvent
