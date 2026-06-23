import type { ActionSpace, Resource } from '../contract/types'

const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export const createMoorActionSpaces = (playerCount: number): ActionSpace[] => {
  const spaces: ActionSpace[] = []
  if (playerCount >= 2 && playerCount <= 6) {
    spaces.push({
      id: 'moor-infirmary',
      nameKey: 'actions.moor-infirmary.name',
      descriptionKey: 'actions.moor-infirmary.description',
      roundAvailable: 1,
      gainPerRound: {},
      maxOccupancy: null,
      canBeExecutedByPlayer: () => true,
      execute: ({ player }) => {
        player.resources.food += 1
        return { type: 'ok' }
      },
      resources: { ...emptyResources },
      takenBy: [],
      blockedBy: [],
    })
  }
  if (playerCount <= 2) {
    spaces.push({
      id: 'moor-resource-market-12',
      nameKey: 'actions.moor-resource-market-12.name',
      descriptionKey: 'actions.moor-resource-market-12.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ player }) => {
        player.resources.food += 1
        player.resources.stone += 1
        return { type: 'ok' }
      },
      resources: { ...emptyResources },
      takenBy: [],
      blockedBy: [],
    })
  }
  return spaces
}
