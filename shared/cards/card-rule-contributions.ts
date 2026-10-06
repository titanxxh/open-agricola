import type { CardRuleContributions } from '../contract/card-state'
import type { PlayerState, SupplyTokenKey } from '../contract/types'
import { getCardEffect } from './card-effects'

export const nonNegativeInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

/** Query isolated inputs and detach results so neither caller can mutate authoritative storage. */
export const collectCardRuleContributions = (player: PlayerState): CardRuleContributions[] => {
  const contributions: CardRuleContributions[] = []
  const sources = new Set([...(player.improvements ?? []), ...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? [])])
  for (const cardId of sources) {
    const query = getCardEffect(cardId)?.getRuleContributions
    if (!query) continue
    // JSON also accepts the read-only proxies used by listener purity guards.
    const contribution = query(JSON.parse(JSON.stringify(player)) as PlayerState)
    if (contribution) contributions.push(structuredClone(contribution))
  }
  return contributions
}

export const getCardReservedSupplyCount = (player: PlayerState, key: SupplyTokenKey): number =>
  collectCardRuleContributions(player).reduce(
    (sum, contribution) => sum + nonNegativeInteger(contribution.reservedSupply?.[key]), 0,
  )

export const getCardUnusedSpaceReduction = (player: PlayerState, unusedSpaces: number): number =>
  Math.min(nonNegativeInteger(unusedSpaces), collectCardRuleContributions(player).reduce(
    (sum, contribution) => sum + nonNegativeInteger(contribution.unusedSpaceReduction), 0,
  ))
