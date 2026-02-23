import type { GameState } from '../../../shared/game/types'
import { createRoundOpenById } from '../../../shared/logic/state'

export const getNextPlayerIndex = (state: GameState) =>
  (state.currentPlayerIndex + 1) % state.players.length

export const getOpenedActionIds = (state: GameState) => {
  const roundOpenById = createRoundOpenById(state.roundActionOrder)
  return Array.from(roundOpenById.entries())
    .filter(([, openRound]) => state.round >= openRound)
    .map(([actionId]) => actionId)
}

export const ensureSingleStartPlayer = (state: GameState, playerId: string) => {
  state.players.forEach((player) => {
    player.startPlayer = player.id === playerId
  })
}
