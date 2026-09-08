import type { Resource } from '../../../shared/contract/types'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../../shared/contract/animals'
import type { HarvestFeedOption } from './use-harvest-flow'

const projectResources = (
  resources: Partial<Resource>,
  option: Pick<HarvestFeedOption, 'from' | 'to'>,
  count: number,
) => {
  const projected = { ...resources }
  for (const [rawKey, amount] of Object.entries(option.from)) {
    const key = rawKey as keyof Resource
    projected[key] = (projected[key] ?? 0) - amount * count
  }
  for (const [rawKey, amount] of Object.entries(option.to)) {
    const key = rawKey as keyof Resource
    projected[key] = (projected[key] ?? 0) + amount * count
  }
  return projected
}

export const canApplyHarvestFeedCounts = (
  allOptions: readonly HarvestFeedOption[],
  counts: Record<string, number>,
  playerResources: Resource,
  placedAnimals: Partial<Pick<Resource, AnimalKey>> = {},
): boolean => {
  let projected: Partial<Resource> = { ...playerResources }
  const placed = { ...placedAnimals }
  const sourceUses = new Map<string, number>()
  for (const option of allOptions) {
    const count = counts[option.id] ?? 0
    if (count <= 0) continue
    const sourceUsed = sourceUses.get(option.sourceId) ?? 0
    if (option.max !== undefined && sourceUsed + count > option.max) return false
    sourceUses.set(option.sourceId, sourceUsed + count)
    for (const animal of ALL_ANIMAL_KEYS) {
      const cost = (option.from[animal] ?? 0) * count
      if (option.fromFarmyard && cost > (placed[animal] ?? 0)) return false
      placed[animal] = Math.max(0, (placed[animal] ?? 0) - cost)
    }
    projected = projectResources(projected, option, count)
    if (Object.values(projected).some((amount) => amount < 0)) return false
  }
  return true
}

export const computeHarvestFeedCounterMax = (
  target: HarvestFeedOption,
  allOptions: readonly HarvestFeedOption[],
  counts: Record<string, number>,
  playerResources: Resource,
  placedAnimals: Partial<Pick<Resource, AnimalKey>> = {},
): number => {
  const targetFromKeys = Object.keys(target.from) as (keyof Resource)[]
  if (targetFromKeys.length === 0) return 0

  let projected: Partial<Resource> = { ...playerResources }
  for (const option of allOptions) {
    if (option.id === target.id) break
    const count = counts[option.id] ?? 0
    if (count <= 0) continue
    projected = projectResources(projected, option, count)
    if (Object.values(projected).some((amount) => amount < 0)) return 0
  }

  let maxTimes = Number.POSITIVE_INFINITY
  for (const k of targetFromKeys) {
    const need = (target.from[k] ?? 0) as number
    if (need <= 0) continue
    const cap = Math.floor((projected[k] ?? 0) / need)
    if (cap < maxTimes) maxTimes = cap
  }
  const resourceMax = Math.max(0, Number.isFinite(maxTimes) ? maxTimes : 0)
  const sourceUsedByOthers = allOptions.reduce(
    (sum, option) => option.id !== target.id && option.sourceId === target.sourceId
      ? sum + (counts[option.id] ?? 0)
      : sum,
    0,
  )
  const sourceMax = target.max === undefined
    ? resourceMax
    : Math.max(0, target.max - sourceUsedByOthers)
  for (let candidate = Math.min(resourceMax, sourceMax); candidate >= 0; candidate -= 1) {
    if (canApplyHarvestFeedCounts(
      allOptions,
      { ...counts, [target.id]: candidate },
      playerResources,
      placedAnimals,
    )) return candidate
  }
  return 0
}
