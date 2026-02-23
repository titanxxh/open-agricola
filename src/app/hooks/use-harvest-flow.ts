import type { GameState } from '../../game/types'
import { performHarvest } from '../../logic/round'

export const canFinalizeHarvest = (pendingFeedByPlayerId: Record<string, number>) =>
  Object.values(pendingFeedByPlayerId).every((value) => value <= 0)

export const runHarvestFlow = (state: GameState) => performHarvest(state)
