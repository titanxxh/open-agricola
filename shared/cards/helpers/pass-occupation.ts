import type { GameState, PlayerState } from '../../contract/types'

export type PassResult =
  | { target: 'next'; playerId: string }
  | { target: 'discard' }

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
  if (idx < 0) return { target: 'discard' }
  player.occupationHand.splice(idx, 1)
  const players = state.players ?? []
  if (players.length <= 1) return { target: 'discard' }
  const currentIdx = players.findIndex((p) => p.id === player.id)
  if (currentIdx < 0) return { target: 'discard' }
  const next = players[(currentIdx + 1) % players.length]!
  next.occupationHand.push(cardId)
  return { target: 'next', playerId: next.id }
}
