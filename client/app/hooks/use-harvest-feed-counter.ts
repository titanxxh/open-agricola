import type { Resource } from '../../../shared/contract/types'
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

export const computeHarvestFeedCounterMax = (
  target: HarvestFeedOption,
  allOptions: readonly HarvestFeedOption[],
  counts: Record<string, number>,
  playerResources: Resource,
): number => {
  const targetFromKeys = Object.keys(target.from) as (keyof Resource)[]
  if (targetFromKeys.length === 0) return 0

  let projected: Partial<Resource> = { ...playerResources }
  let beforeTarget = true
  for (const option of allOptions) {
    if (option.id === target.id) {
      beforeTarget = false
      continue
    }
    const count = counts[option.id] ?? 0
    if (count <= 0) continue
    projected = projectResources(
      projected,
      beforeTarget ? option : { from: option.from, to: {} },
      count,
    )
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
  return Math.min(resourceMax, target.max ?? resourceMax)
}
