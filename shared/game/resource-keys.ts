import type { Resource } from '../contract/types'

// Real resources actually held in player.resources / space.resources.
// `begging` is included as a real key because it tracks begging-card count.
export const REAL_RESOURCE_KEYS = [
  'wood', 'clay', 'reed', 'stone',
  'food', 'grain', 'vegetable',
  'sheep', 'boar', 'cattle',
  'begging',
] as const satisfies ReadonlyArray<keyof Resource>

// Pseudo keys are NEVER stored in player.resources. They live exclusively in
// CardResourceStats.gained to record BGA-style "Plows: N / Built: N rooms"
// progress lines via the same Partial<Resource> storage slot.
export const PSEUDO_RESOURCE_KEYS = [
  'occupation', 'field',
  'roomWood', 'roomClay', 'roomStone',
  'stable',
] as const

export type PseudoResourceKey = (typeof PSEUDO_RESOURCE_KEYS)[number]

const PSEUDO_SET: ReadonlySet<string> = new Set(PSEUDO_RESOURCE_KEYS)

export const isPseudoResourceKey = (key: string): key is PseudoResourceKey =>
  PSEUDO_SET.has(key)
