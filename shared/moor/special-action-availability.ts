import type { GameState, PlayerState } from '../contract/types'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'
import { hasHealthyWorkerAtHome } from './heating'
import { moorSpecialActionBaseResources, moorSpecialActionBorrowCost } from '../domain/moor-special-action-values'
export const isMoorSpecialActionCardUsableByPlayer = (
  card: MoorSpecialActionCardState,
  playerId: string,
): boolean =>
  card.location.kind === 'market'
  || (card.location.kind === 'playerFaceUp' && card.location.playerId !== playerId)

export const canTakeVisibleMoorSpecialAction = (
  state: GameState,
  currentPlayer: PlayerState,
  card: MoorSpecialActionCardState,
  actionId: MoorSpecialActionId,
): boolean => {
  if (state.players[state.currentPlayerIndex]?.id !== currentPlayer.id) return false
  if (!isMoorSpecialActionCardUsableByPlayer(card, currentPlayer.id)) return false
  if (!hasHealthyWorkerAtHome(state, currentPlayer)) return false
  const borrowFood = moorSpecialActionBorrowCost(state, card.id).food ?? 0
  const { cost } = moorSpecialActionBaseResources(actionId, state.players.length)
  return (
    currentPlayer.resources.food >= borrowFood + (cost.food ?? 0) &&
    (currentPlayer.resources.fuel ?? 0) >= (cost.fuel ?? 0)
  )
}
