import type { GameState, PlayerState } from '../contract/types'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'
import { hasHealthyWorkerAtHome } from './heating'
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
  const borrowFood = card.location.kind === 'playerFaceUp' && card.location.playerId !== currentPlayer.id ? 2 : 0
  const actionFood =
    actionId === 'horse-market' && [2, 5, 6].includes(state.players.length) ? 1
      : actionId === 'illicit-work' ? 1
        : 0
  const actionFuel = actionId === 'black-market' || actionId === 'illicit-work' ? 1 : 0
  return (
    currentPlayer.resources.food >= borrowFood + actionFood &&
    (currentPlayer.resources.fuel ?? 0) >= actionFuel
  )
}
