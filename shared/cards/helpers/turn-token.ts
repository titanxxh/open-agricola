import type { ActionFlow, PlayerState } from '../../contract/types'
import { ACTION_SNAPSHOT_CARD_ID } from './action-snapshot-state'

/** Card State key a card uses for its once-per-Turn record unless it needs several. */
export const USED_THIS_TURN_KEY = 'usedTurnToken'

/** Identity of the player's open Turn Scope, or undefined outside a Turn. */
export const readTurnScopeToken = (player: PlayerState): number | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.token as number | undefined

/** Whether `cardId` recorded `key` in the current Turn; always false outside a Turn. */
export const isUsedThisTurn = (player: PlayerState, cardId: string, key = USED_THIS_TURN_KEY): boolean => {
  const token = readTurnScopeToken(player)
  return token !== undefined && player.cardStates?.[cardId]?.extraData?.[key] === token
}

/** Leaf that records `key` for `cardId` in the current Turn; undefined outside a Turn. */
export const markUsedThisTurnLeaf = (player: PlayerState, cardId: string, key = USED_THIS_TURN_KEY): ActionFlow | undefined => {
  const token = readTurnScopeToken(player)
  if (token === undefined) return
  return { type: 'leaf', actionId: 'special-effect', sourceCard: cardId, params: { kind: 'set-extra-data', key, value: token } }
}
