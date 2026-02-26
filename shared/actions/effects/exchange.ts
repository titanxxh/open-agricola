import type {
  ActionExecutionResult,
  PlayerState,
  Resource,
  Trade,
  ResourceKey,
} from '../../game/types'
import { canPayResources, payResources } from './pay'
import { gainResources } from './gain'

const scaleResources = (resources: Partial<Resource>, times: number) => {
  const scaled: Partial<Resource> = {}
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const value = resources[resourceKey] ?? 0
    if (value !== 0) {
      scaled[resourceKey] = value * times
    }
  })
  return scaled
}

/**
 * Legacy exchange function for backward compatibility
 * Exchange resources: pay cost, gain reward (times times)
 */
export const exchangeResources = (
  player: PlayerState,
  cost: Partial<Resource>,
  gain: Partial<Resource>,
  times = 1,
): ActionExecutionResult => {
  if (times <= 0) {
    return { type: 'ok' }
  }
  const scaledCost = scaleResources(cost, times)
  if (!canPayResources(player, scaledCost)) {
    return { type: 'ok' }
  }
  payResources(player, scaledCost)
  gainResources(player, scaleResources(gain, times))
  return { type: 'ok' }
}

// ============================================
// Enhanced Trade System (BGA-aligned)
// ============================================

/**
 * Check if a player can afford a single trade
 * @param player - Player state
 * @param trade - Trade definition
 * @param times - Number of times to apply the trade (default 1)
 * @returns true if player has enough resources to perform the trade
 */
export const canAffordTrade = (
  player: PlayerState,
  trade: Trade,
  times: number = 1,
): boolean => {
  const fromResources = trade.from
  const resourceKeys = Object.keys(fromResources) as ResourceKey[]

  return resourceKeys.every((key) => {
    const requiredAmount = (fromResources[key] ?? 0) * times
    return player.resources[key] >= requiredAmount
  })
}

/**
 * Get the maximum number of times a trade can be applied
 * @param player - Player state
 * @param trade - Trade definition with optional max limit
 * @returns Maximum times the trade can be applied
 */
export const getMaxTradeTimes = (player: PlayerState, trade: Trade): number => {
  const fromResources = trade.from
  const resourceKeys = Object.keys(fromResources) as ResourceKey[]

  // Calculate max times based on player resources
  let maxFromResources = Infinity
  for (const key of resourceKeys) {
    const requiredPerTrade = fromResources[key] ?? 0
    if (requiredPerTrade > 0) {
      const timesFromThisResource = Math.floor(
        player.resources[key] / requiredPerTrade,
      )
      maxFromResources = Math.min(maxFromResources, timesFromThisResource)
    }
  }

  // Apply trade's max limit if specified
  const tradeMax = trade.max ?? Infinity
  return Math.min(maxFromResources, tradeMax)
}

/**
 * Apply a trade to player resources (mutates player state)
 * @param player - Player state to mutate
 * @param trade - Trade definition
 * @param times - Number of times to apply the trade (default 1)
 */
export const applyTrade = (
  player: PlayerState,
  trade: Trade,
  times: number = 1,
): void => {
  // Deduct 'from' resources
  const fromKeys = Object.keys(trade.from) as ResourceKey[]
  for (const key of fromKeys) {
    const amount = (trade.from[key] ?? 0) * times
    player.resources[key] -= amount
  }

  // Add 'to' resources
  const toKeys = Object.keys(trade.to) as ResourceKey[]
  for (const key of toKeys) {
    const amount = (trade.to[key] ?? 0) * times
    player.resources[key] += amount
  }
}

/**
 * Convert resources according to a trade without mutating player state
 * @param resources - Current resources
 * @param trade - Trade definition
 * @param times - Number of times to apply the trade (default 1)
 * @returns New resources after conversion
 */
export const convertResources = (
  resources: Partial<Resource>,
  trade: Trade,
  times: number = 1,
): Partial<Resource> => {
  const result: Partial<Resource> = { ...resources }

  // Deduct 'from' resources
  const fromKeys = Object.keys(trade.from) as ResourceKey[]
  for (const key of fromKeys) {
    const amount = (trade.from[key] ?? 0) * times
    result[key] = (result[key] ?? 0) - amount
  }

  // Add 'to' resources
  const toKeys = Object.keys(trade.to) as ResourceKey[]
  for (const key of toKeys) {
    const amount = (trade.to[key] ?? 0) * times
    result[key] = (result[key] ?? 0) + amount
  }

  return result
}

/**
 * Check if resources are all non-negative (valid state)
 * @param resources - Resources to check
 * @returns true if all resource values are >= 0
 */
export const hasValidResources = (resources: Partial<Resource>): boolean => {
  const keys = Object.keys(resources) as ResourceKey[]
  return keys.every((key) => (resources[key] ?? 0) >= 0)
}

/**
 * Get all possible trade application counts (0 to max times)
 * @param player - Player state
 * @param trade - Trade definition
 * @returns Array of possible application counts
 */
export const getPossibleTradeTimes = (
  player: PlayerState,
  trade: Trade,
): number[] => {
  const maxTimes = getMaxTradeTimes(player, trade)
  const result: number[] = []
  for (let i = 0; i <= maxTimes; i++) {
    result.push(i)
  }
  return result
}

/**
 * Reverse a trade (swap from and to)
 * @param trade - Trade to reverse
 * @returns Reversed trade
 */
export const reverseTrade = (trade: Trade): Trade => ({
  from: trade.to,
  to: trade.from,
  max: trade.max,
  source: trade.source,
  sourceId: trade.sourceId,
})
