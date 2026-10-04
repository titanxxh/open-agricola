// Pure data constants and helpers safe for client import.
//
// This module is contract layer — type-only-ish: it holds zero-dep literals
// (`emptyResources`, `resourceKeyList`, `harvestRounds`) and one pure helper
// (`createRoundOpenById`) used by both client UI and the session runtime.
//
// Do NOT add any import beyond `./types` here. Anything needing
// `shared/utils/*`, `shared/domain/*`, or session/runtime modules must live
// in `shared/session/state-constants.ts` instead.

import type { Resource } from './types'

export const emptyResources: Resource = {
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

export const resourceKeyList: (keyof Resource)[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

export const extendedResourceKeyList: (keyof Resource)[] = [
  ...resourceKeyList,
  'horse',
  'fuel',
]

export const harvestRounds = [4, 7, 9, 11, 13, 14]

export const roundStageSlots = [
  { stage: 1, count: 4 },
  { stage: 2, count: 3 },
  { stage: 3, count: 2 },
  { stage: 4, count: 2 },
  { stage: 5, count: 2 },
  { stage: 6, count: 1 },
]

export const roundStageActions: Record<number, string[]> = {
  1: ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement'],
  2: ['wish-children', 'western-quarry', 'house-redevelopment'],
  3: ['vegetable-seeds', 'pig-market'],
  4: ['eastern-quarry', 'cattle-market'],
  5: ['cultivation', 'urgent-wish-children'],
  6: ['farm-redevelopment'],
}

/** Every round card. The set and each card's stage are public; the order inside a stage is not. */
export const roundCardActionIds: readonly string[] = Object.values(roundStageActions).flat()

export const createRoundOpenById = (order: (string | null)[]) =>
  new Map(
    order
      .map((id, index) => (id ? [id, index + 1] : null))
      .filter((item): item is [string, number] => item !== null),
  )
