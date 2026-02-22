import type { GameState, PlayerState } from '../../game/types'
import { setStartPlayer } from './start-player'

export const setFirstPlayer = (state: GameState, player: PlayerState) =>
  setStartPlayer(state, player)
