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
