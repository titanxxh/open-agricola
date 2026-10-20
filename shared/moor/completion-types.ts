import type { CardListenerOwnerZone } from '../cards/card-listeners'
import type { TriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import type { ActionExecutionResult } from '../contract/types'
import type { DraftGameEvent } from '../contract/events'
import type { MoorSpecialActionPayload } from './special-actions'
import type { MoorSpecialActionId } from './types'

/** Native trigger facts; never inherited by ordinary child actions. */
export type MoorActionContext = {
  actionId: MoorSpecialActionId
  payload: MoorSpecialActionPayload
  playerId: string
  specialActionCardId?: string
} & ({ phase: 'before' } | {
  phase: 'after'
  result: Extract<ActionExecutionResult, { type: 'ok' }>
  terrainCleared?: boolean
})

/** Captured at base commit, before improvement/onBuy/animal follow-ups. */
export type MoorCompletionFrame = Omit<Extract<MoorActionContext, { phase: 'after' }>, 'phase'> & {
  terrainEvent?: DraftGameEvent<'farm.terrainChanged'>
  sources: ({
    listenerId: string
    ownerPlayerId: string
    cardId: string
    ownerCardZone: CardListenerOwnerZone
  } | { listenerId: string; cardId: ''; ownerPlayerId: ''; ownerCardZone?: undefined })[]
  triggerSnapshot: TriggerSnapshot
}
