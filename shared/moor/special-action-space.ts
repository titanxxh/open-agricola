import type { ActionSpace, Resource } from '../contract/types'
import type { MoorSpecialActionId } from './types'

const emptyResources = (): Resource => ({
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
  fuel: 0,
  horse: 0,
})

export const createMoorSpecialActionSpace = (actionId: MoorSpecialActionId): ActionSpace => ({
  id: actionId,
  nameKey: `moor.specialActions.${actionId}`,
  descriptionKey: `moor.specialActions.${actionId}`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: emptyResources(),
  takenBy: [],
})
