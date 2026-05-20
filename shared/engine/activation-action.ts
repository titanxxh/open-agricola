import type { ActionHookPhase } from '../actions/hooks'
import type { GameEvent } from '../contract/events'
import { ActionNode } from './nodes/action-node'
import type { EngineNode } from './types'

export const ACTIVATE_CARD_ACTION_ID = 'activate-card'

export type ActivateCardActionParams = {
  listenerId: string
  cardId: string
  phase: ActionHookPhase
  actionId: string
  event: Record<string, unknown>
  ownerPlayerId?: string
  triggerPlayerId?: string
  mandatory?: boolean
  countCardUse?: boolean
  transactionEvents?: GameEvent[]
  actionEvents?: GameEvent[]
  actionEventStartIndex?: number
}

export type ActivateCardActionNode = ActionNode & {
  params: ActivateCardActionParams
}

export function isActivateCardActionNode(node: EngineNode): node is ActivateCardActionNode {
  return node instanceof ActionNode && node.actionId === ACTIVATE_CARD_ACTION_ID
}
