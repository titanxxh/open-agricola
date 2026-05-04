/**
 * Module-level solution cache for the payment solver. Holds the result of
 * computeAllBuyableCombinations keyed by (player, cost, costType, playedCards).
 *
 * Cache is shared across GameSession instances — the cache key fully captures
 * the state-dependent inputs, so cross-session leak is impossible. Tests
 * call PaymentSolver.clearCache() between cases via the public namespace.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type { ComplexCost, CostModifierType, PaymentSolution, PlayerState } from '../../../game/types'

class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number;
  constructor(maxSize: number) { this.maxSize = maxSize }
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }
  clear(): void {
    this.cache.clear()
  }
}

export const solutionCache = new LRUCache<string, PaymentSolution[]>(100)

export const makeCacheKey = (
  player: PlayerState,
  cost: ComplexCost,
  costType?: CostModifierType,
  playedCards?: string[],
): string => {
  const reserveKey = Object.entries(player.resources)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  const costKey = JSON.stringify(cost)
  const typeKey = costType ?? 'none'
  const playedCardsKey = [...(playedCards ?? [])].sort().join(',')
  return `${reserveKey}|${costKey}|${typeKey}|${playedCardsKey}`
}

export const clearPaymentCache = () => {
  solutionCache.clear()
}
