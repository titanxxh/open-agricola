import type { EncyclopediaEntry, EncyclopediaGroup, EncyclopediaPublicType } from '../../../shared/contract/card-encyclopedia'
import { PAYMENT_RESOURCE_KEYS } from '../../../shared/contract/resource-keys'
import type { EncyclopediaItem } from './encyclopedia-item'
import { encyclopediaPointsApply } from './encyclopedia-labels'

export type EncyclopediaCostResource = typeof PAYMENT_RESOURCE_KEYS[number]

/**
 * One key per filter group: options within a group match if any of them matches,
 * and every group with a selection must match.
 */
export type EncyclopediaFilters = Readonly<{
  groups: readonly EncyclopediaGroup[]
  types: readonly EncyclopediaPublicType[]
  /** Printed payment data only; the return-a-card upgrade is a separate option of the same group. */
  cost: Readonly<{ resources: readonly EncyclopediaCostResource[]; upgradeReturn: boolean }>
  /** Inclusive bounds on the printed fixed score; `unlisted` adds entries that print none. */
  points: Readonly<{ min: number | null; max: number | null; unlisted: boolean }>
  extraVp: boolean
}>

export const EMPTY_ENCYCLOPEDIA_FILTERS: EncyclopediaFilters = Object.freeze({
  groups: [],
  types: [],
  cost: Object.freeze({ resources: [], upgradeReturn: false }),
  points: Object.freeze({ min: null, max: null, unlisted: false }),
  extraVp: false,
})

const anyOf = <T>(selected: readonly T[], matches: (option: T) => boolean): boolean =>
  selected.length === 0 || selected.some(matches)

const matchesCost = ({ cost }: EncyclopediaEntry, { resources, upgradeReturn }: EncyclopediaFilters['cost']): boolean => {
  if (resources.length === 0 && !upgradeReturn) return true
  if (upgradeReturn && cost.kind !== 'notApplicable' && (cost.returnCards?.length ?? 0) > 0) return true
  return cost.kind === 'printed' && cost.paths.some(path => resources.some(resource => (path[resource] ?? 0) > 0))
}

const matchesPoints = (entry: EncyclopediaEntry, { min, max, unlisted }: EncyclopediaFilters['points']): boolean => {
  const ranged = min !== null || max !== null
  if (!ranged && !unlisted) return true
  const { fixed } = entry.score
  if (fixed === null) return unlisted && encyclopediaPointsApply(entry)
  return ranged && (min === null || fixed >= min) && (max === null || fixed <= max)
}

/** Keeps the incoming order. */
export const filterEncyclopedia = (
  items: readonly EncyclopediaItem[],
  filters: EncyclopediaFilters,
): readonly EncyclopediaItem[] => items.filter(({ entry }) =>
  anyOf(filters.groups, group => entry.group === group)
  && anyOf(filters.types, type => entry.publicType === type)
  && matchesCost(entry, filters.cost)
  && matchesPoints(entry, filters.points)
  && (!filters.extraVp || entry.score.extraVp))
