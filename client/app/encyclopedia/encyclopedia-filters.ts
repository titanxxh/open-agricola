import {
  ENCYCLOPEDIA_GROUPS,
  type EncyclopediaEntry,
  type EncyclopediaGroup,
  type EncyclopediaPublicType,
} from '../../../shared/contract/card-encyclopedia'
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

export const ENCYCLOPEDIA_FILTER_TYPES = [
  'minor', 'occupation', 'major', 'mother', 'father', 'moorSpecialAction', 'moorStart', 'season',
] as const satisfies readonly EncyclopediaPublicType[]

export type EncyclopediaFilterOptions = Readonly<{
  groups: readonly EncyclopediaGroup[]
  types: readonly EncyclopediaPublicType[]
  costResources: readonly EncyclopediaCostResource[]
  upgradeReturn: boolean
}>

const returnsCards = ({ cost }: EncyclopediaEntry): boolean =>
  cost.kind !== 'notApplicable' && (cost.returnCards?.length ?? 0) > 0

const printedResources = ({ cost }: EncyclopediaEntry): EncyclopediaCostResource[] =>
  cost.kind === 'printed'
    ? PAYMENT_RESOURCE_KEYS.filter(resource => cost.paths.some(path => (path[resource] ?? 0) > 0))
    : []

/** Only options some entry of the catalog can match. */
export function encyclopediaFilterOptions(items: readonly EncyclopediaItem[]): EncyclopediaFilterOptions {
  const groups = new Set(items.map(({ entry }) => entry.group))
  const types = new Set<EncyclopediaPublicType>(items.map(({ entry }) => entry.publicType))
  const resources = new Set(items.flatMap(({ entry }) => printedResources(entry)))
  return {
    groups: ENCYCLOPEDIA_GROUPS.filter(group => groups.has(group)),
    types: ENCYCLOPEDIA_FILTER_TYPES.filter(type => types.has(type)),
    costResources: PAYMENT_RESOURCE_KEYS.filter(resource => resources.has(resource)),
    upgradeReturn: items.some(({ entry }) => returnsCards(entry)),
  }
}

const anyOf = <T>(selected: readonly T[], matches: (option: T) => boolean): boolean =>
  selected.length === 0 || selected.some(matches)

const matchesCost = (entry: EncyclopediaEntry, { resources, upgradeReturn }: EncyclopediaFilters['cost']): boolean => {
  if (resources.length === 0 && !upgradeReturn) return true
  if (upgradeReturn && returnsCards(entry)) return true
  return printedResources(entry).some(resource => resources.includes(resource))
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

type Fields = Readonly<Record<string, unknown>>

const fieldsOf = (value: unknown): Fields =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {}

const optionsOf = <T extends string>(order: readonly T[], value: unknown): T[] =>
  Array.isArray(value) ? order.filter(option => value.includes(option)) : []

const boundOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Turns any outside value, such as a stored snapshot, into valid filters; anything unrecognised is dropped. */
export function normalizeEncyclopediaFilters(value: unknown): EncyclopediaFilters {
  const fields = fieldsOf(value)
  const cost = fieldsOf(fields.cost)
  const points = fieldsOf(fields.points)
  return {
    groups: optionsOf(ENCYCLOPEDIA_GROUPS, fields.groups),
    types: optionsOf(ENCYCLOPEDIA_FILTER_TYPES, fields.types),
    cost: { resources: optionsOf(PAYMENT_RESOURCE_KEYS, cost.resources), upgradeReturn: cost.upgradeReturn === true },
    points: { min: boundOf(points.min), max: boundOf(points.max), unlisted: points.unlisted === true },
    extraVp: fields.extraVp === true,
  }
}
