import type { GameState } from '../../../shared/contract/types'
import type { Locale } from '../../../shared/i18n'
import { getPlayerDisplayName } from '../../utils/player-name'

/**
 * Round-1 placement orders shown by the Snake Opening pill: the first pass
 * follows the Round Work Order from `roundFirstPlayerId`, the second pass is
 * that order reversed. Display-only; the server owns the actual rotation.
 */
export const snakeOpeningPlacementOrders = (
  state: Pick<GameState, 'players' | 'roundFirstPlayerId'>,
  locale: Locale,
): { first: string[]; second: string[] } => {
  const players = state.players ?? []
  const startIndex = Math.max(0, players.findIndex((player) => player.id === state.roundFirstPlayerId))
  const names = players.map((player, index) => getPlayerDisplayName(locale, player.name, index, player.nameIsDefault))
  const first = [...names.slice(startIndex), ...names.slice(0, startIndex)]
  return { first, second: [...first].reverse() }
}
