import type { GameState, PlayerState } from '../../game/types'

export const setStartPlayer = (state: GameState, player: PlayerState) => {
  state.players.forEach((item) => {
    item.startPlayer = item.id === player.id
  })
}
