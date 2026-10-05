import type { InputWindow } from './commands'
import type { HistoryWindow } from './history'
import type { InteractionState, PlayerState, Resource } from '../../contract/types'
import type { SerializedGameState } from '../../session/serialization'
import type { PlayerScoreSummary } from '../../domain'
import type { CardDefinition } from '../cards'
import type { PrivateGameEvent as RuntimePrivateGameEvent } from '../private-events'

export type {
  PrivateDraftUpdatedEvent,
  PrivateGameEvent,
  PrivateHandChangedEvent,
  PrivatePromptShownEvent,
} from '../private-events'

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

export type PublicEventCancellation = {
  reason: 'undoStep' | 'undoAction' | 'provisionalContinuationRollback'
  previousMaxSeq: number
  nextMaxSeq: number
  canceledEventIds: string[]
  canceledSeqs: number[]
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

export type GameSyncPayload = {
  state: SerializedGameState
  historyWindow?: HistoryWindow
  interaction: ClientInteractionState
  privateEvents?: RuntimePrivateGameEvent[]
  publicEventCancellations?: PublicEventCancellation[]
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
  cardWarnings?: string[]
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
  inputWindow?: InputWindow
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}
