import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { ACTION_SNAPSHOT_CARD_ID, readActionSnapshotExtraData } from './action-snapshot-state'

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

/**
 * The open Turn, or else the gap since the player's last Turn ended (other players' Turns, harvest,
 * round end and start) until their next Turn begins. A gap never equals a Turn token.
 */
const readTurnOrGapToken = (player: PlayerState): number | string =>
  readTurnScopeToken(player) ?? `gap:${readActionSnapshotExtraData<number>(player, 'lastToken') ?? 0}`

/**
 * Whether `cardId` recorded `key` in the player's current Turn or in the gap since their last Turn.
 * A work-phase query for the rotation player before their Turn opens previews that Turn as unused.
 */
export const isUsedThisTurnOrGap = (state: GameState, player: PlayerState, cardId: string, key = USED_THIS_TURN_KEY): boolean => {
  const previewsNextTurn = readTurnScopeToken(player) === undefined && state.roundPhase === 'work'
    && state.players[state.currentPlayerIndex]?.id === player.id
  return !previewsNextTurn && player.cardStates?.[cardId]?.extraData?.[key] === readTurnOrGapToken(player)
}

/** Leaf that records `key` for `cardId` in the player's current Turn or gap. */
export const markUsedThisTurnOrGapLeaf = (player: PlayerState, cardId: string, key = USED_THIS_TURN_KEY): ActionFlow =>
  ({ type: 'leaf', actionId: 'special-effect', sourceCard: cardId, params: { kind: 'set-extra-data', key, value: readTurnOrGapToken(player) } })
