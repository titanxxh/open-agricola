import type { MoorSpecialActionId } from '../moor/types'

const MOOR_SPECIAL_ACTION_IDS = new Set<string>([
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'horse-market',
  'hiring-fair',
  'black-market',
  'illicit-work',
])

export const isMoorSpecialActionId = (value: string): value is MoorSpecialActionId =>
  MOOR_SPECIAL_ACTION_IDS.has(value)

export const isMoorTerrainAction = (actionId: MoorSpecialActionId): boolean =>
  actionId === 'cut-peat' || actionId === 'fell-trees' || actionId === 'slash-and-burn'
