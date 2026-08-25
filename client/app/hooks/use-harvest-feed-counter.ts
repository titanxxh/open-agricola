import type { Resource } from '../../../shared/contract/types'
import type { HarvestFeedOption } from './use-harvest-flow'

/**
 * Max value for a harvest-feed option's counter. Per from-key constraint:
 *   sum_over_other_options(from[k] * count) + target.count * target.from[k]
 *     <= player.resources[k]
 *
 * The target option's current count is excluded from "usedByOthers", so the
 * cap returned is the absolute upper bound the user could set the counter to
 * regardless of its current value.
 */
export const computeHarvestFeedCounterMax = (
  target: HarvestFeedOption,
  allOptions: readonly HarvestFeedOption[],
  counts: Record<string, number>,
  playerResources: Resource,
): number => {
  const targetFromKeys = Object.keys(target.from) as (keyof Resource)[]
  if (targetFromKeys.length === 0) return 0

  let maxTimes = Number.POSITIVE_INFINITY
  for (const k of targetFromKeys) {
    const need = (target.from[k] ?? 0) as number
    if (need <= 0) continue
    const have = playerResources[k] ?? 0
    let usedByOthers = 0
    for (const o of allOptions) {
      if (o.id === target.id) continue
      const c = counts[o.id] ?? 0
      const f = (o.from[k] ?? 0) as number
      usedByOthers += c * f
    }
    const remaining = have - usedByOthers
    const cap = Math.floor(remaining / need)
    if (cap < maxTimes) maxTimes = cap
  }
  const resourceMax = Math.max(0, Number.isFinite(maxTimes) ? maxTimes : 0)
  return Math.min(resourceMax, target.max ?? resourceMax)
}
