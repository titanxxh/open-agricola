import type { GameState } from '../../../shared/contract/types'

/**
 * Round-1 placement orders shown by the Snake Opening pill: the first pass
 * follows the Round Work Order from `roundFirstPlayerId`, the second pass is
 * that order reversed. Display-only; the server owns the actual rotation.
 */
export const snakeOpeningPlacementOrders = (
  state: Pick<GameState, 'players' | 'roundFirstPlayerId'>,
): { first: string[]; second: string[] } => {
  const players = state.players ?? []
  const startIndex = Math.max(0, players.findIndex((player) => player.id === state.roundFirstPlayerId))
  const first = [...players.slice(startIndex), ...players.slice(0, startIndex)].map((player) => player.name)
  return { first, second: [...first].reverse() }
}
