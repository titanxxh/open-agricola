import type {
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../contract/types'
import {
  addCardResourcePaid,
  addCardResourceSaved,
} from './card-state'

const scaleResources = (
  resources: Partial<Resource>,
  factor: number,
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value === 0) return
    out[key as keyof Resource] = value * factor
  })
  return out
}

const hasPositiveResources = (resources: Partial<Resource>): boolean =>
  Object.values(resources).some((value) => typeof value === 'number' && value > 0)

/**
 * Distribute `paid` and `saved` over each card that contributed to a
 * PaymentSolution. Mirrors the reference `Pay::updateSourceCardStatsFromCost`
 * (`the reference`) but uses our pre-built
 * solution so we don't have to re-derive a "reference combination".
 *
 * Trade attribution rules:
 *  - Unit-cost trades use their recorded actual cost attribution.
 *  - Other trades with sourceId derive attribution from their declaration:
 *    saved[res] += times * trade.from[res]
 *    paid[res]  += times * trade.to[res]
 *  - tradesUsed without sourceId are engine-internal and skipped.
 *
 * Bonus attribution: bonusUsed is a comma-separated list of card ids. The
 * caller passes an optional `bonusReductions` map keyed by card id giving the
 * resources each bonus saved. We need this externally because PaymentSolution
 * doesn't carry the bonus's "from/to" semantics directly.
 */
export const recordPaymentStats = (
  player: PlayerState,
  solution: PaymentSolution,
  bonusReductions: Record<string, Partial<Resource>> = {},
) => {
  for (const used of solution.tradesUsed) {
    const sourceId = used.trade.sourceId
    if (!sourceId) continue
    const isPureDiscount = !hasPositiveResources(used.trade.from as Partial<Resource>)
    const saved = used.costAttribution
      ? used.costAttribution.saved ?? {}
      : scaleResources(
          (isPureDiscount ? used.trade.to : used.trade.from) as Partial<Resource>,
          used.times,
        )
    const paid = used.costAttribution
      ? used.costAttribution.paid ?? {}
      : isPureDiscount
        ? {}
        : scaleResources(used.trade.to as Partial<Resource>, used.times)
    if (Object.keys(saved).length > 0) {
      addCardResourceSaved(player, sourceId, saved)
    }
    if (Object.keys(paid).length > 0) {
      addCardResourcePaid(player, sourceId, paid)
    }
  }

  const bonusUsed = solution.bonusUsed
  if (bonusUsed) {
    bonusUsed.split(',').forEach((rawId) => {
      const id = rawId.trim()
      if (!id) return
      const reduction = bonusReductions[id]
      if (!reduction) return
      addCardResourceSaved(player, id, reduction)
    })
  }
}
