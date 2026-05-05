import type { InteractionState, PlayerState, Resource } from '../game/types'
import type { SerializedGameState } from '../game/serialization'
import type { PlayerScoreSummary } from '../domain'
import type { CardDefinition } from '../cards/types'

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

export type GameSyncPayload = {
  state: SerializedGameState
  interaction: InteractionState
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
