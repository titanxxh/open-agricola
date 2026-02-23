import type { GameState } from '../../game/types'
import { persistGame } from '../../services/api'

export const usePersistence = () => {
  const persistState = async (state: GameState) => {
    await persistGame(state)
  }
  return { persistState }
}
