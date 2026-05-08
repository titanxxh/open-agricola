import type { GameState, Resource } from '../contract/types'

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

export const trackWorkPhaseBuildingResources = (
  state: GameState,
  playerId: string,
  gainedResources: Partial<Resource>,
): number => {
  if (state.roundPhase !== 'work') return 0
  let totalBuildingGained = 0
  for (const res of BUILDING_RESOURCES) {
    const amount = gainedResources[res] ?? 0
    if (amount > 0) {
      totalBuildingGained += amount
      if (!state.workPhaseObtainedResources[playerId]) {
        state.workPhaseObtainedResources[playerId] = {}
      }
      const current = state.workPhaseObtainedResources[playerId][res] ?? 0
      state.workPhaseObtainedResources[playerId][res] = current + amount
    }
  }
  return totalBuildingGained
}

export const getWorkPhaseBuildingResources = (
  state: GameState,
  playerId: string,
): number => {
  const playerResources = state.workPhaseObtainedResources[playerId] ?? {}
  let total = 0
  for (const res of BUILDING_RESOURCES) {
    total += playerResources[res] ?? 0
  }
  return total
}

export const clearWorkPhaseBuildingResources = (
  state: GameState,
  playerId: string,
): void => {
  delete state.workPhaseObtainedResources[playerId]
}
