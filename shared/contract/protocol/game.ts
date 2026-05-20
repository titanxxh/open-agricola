import type { InteractionState, PlayerState, Resource } from '../../contract/types'
import type { SerializedGameState } from '../../session/serialization'
import type { PlayerScoreSummary } from '../../domain'
import type { CardDefinition } from '../cards'

export type CustomCardDef = {
  cardType: 'minor' | 'occupation'
  cardJson: CardDefinition
  artUrl?: string | null
}

export type ActionDetailEffects = {
  buildRoom?: number
  buildStables?: number
  growFamily?: number
  plow?: number
  sowGrain?: number
  sowVegetable?: number
  renovate?: { from: PlayerState['houseType']; to: PlayerState['houseType'] }
  fencing?: number
  palisading?: number
  improvements?: string[]
  minorImprovements?: string[]
  startPlayer?: boolean
  bakeBread?: { count: number; food: number }
}

export type ActionDetailParts = {
  gains?: Partial<Resource>
  costs?: Partial<Resource>
  effects?: ActionDetailEffects
  /**
   * Card ids (e.g. `A123_FrameBuilder`) whose `BonusModifier.sources` fired
   * during the action — rendered as a "via {card}" attribution in the log
   * entry so the player can see which card caused a cost reduction.
   */
  bonusSources?: string[]
}

export type RedactedPrivatePromptInteraction =
  Omit<Extract<InteractionState, { stateId: 'wait' }>, 'request' | 'allowedCommands' | 'anytimeActions'> & {
    request: {
      kind: 'private-prompt'
      playerIndex: number
      promptKind: string
      sourceCard?: string
      promptKey?: string
    }
    allowedCommands: []
    anytimeActions: []
  }

export type ClientInteractionState = InteractionState | RedactedPrivatePromptInteraction

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
  picked?: { occCardId: string; minorCardId: string }
  poolCounts: { occ: number; minor: number }
  keptCounts: { occ: number; minor: number }
  advanced: boolean
  finished: boolean
}

export type PrivateGameEvent =
  | PrivatePromptShownEvent
  | PrivateHandChangedEvent
  | PrivateDraftUpdatedEvent

export type GameSyncPayload = {
  state: SerializedGameState
  interaction: ClientInteractionState
  privateEvents?: PrivateGameEvent[]
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
  /** Custom card definitions for frontend registration — treated identically to built-in cards. */
  customCardDefs?: CustomCardDef[]
}

export type StateUpdateCause =
  | 'action'
  | 'choice'
  | 'anytime'
  | 'reorg'
  | 'feed'
  | 'undo'
  | 'dev'
  | 'reconnect'
  | 'draftSubmit'

export type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}
