import type { GameState, PlayerState } from '../../contract/types'

export type PassResult =
  | { target: 'next'; cardId: string; fromPlayerId: string; targetPlayerId: string }
  | { target: 'discard'; cardId?: string; fromPlayerId: string }

/**
 * Remove `cardId` from `player.occupationHand` and hand it to the next seat.
 * Solo (1 player) or when the card isn't in hand: discard (no target).
 */
export const passOccupationToNextPlayer = (
  state: GameState,
  player: PlayerState,
  cardId: string,
): PassResult => {
  const idx = player.occupationHand.indexOf(cardId)
  if (idx < 0) return { target: 'discard', fromPlayerId: player.id }
  player.occupationHand.splice(idx, 1)
  const players = state.players ?? []
  if (players.length <= 1) return { target: 'discard', cardId, fromPlayerId: player.id }
  const currentIdx = players.findIndex((p) => p.id === player.id)
  if (currentIdx < 0) return { target: 'discard', cardId, fromPlayerId: player.id }
  const next = players[(currentIdx + 1) % players.length]!
  next.occupationHand.push(cardId)
  return { target: 'next', cardId, fromPlayerId: player.id, targetPlayerId: next.id }
}
