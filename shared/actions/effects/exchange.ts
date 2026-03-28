import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
  Resource,
  Trade,
  ResourceKey,
} from '../../game/types'
import { payResources } from './pay'
import { gainResources } from './gain'
import { canAffordFlatCost } from './pay-helpers'
import { trackWorkPhaseBuildingResources } from '../../logic/work-phase-resources'

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

const mergePositiveResources = (
  base: Partial<Resource>,
  delta: Partial<Resource>,
): Partial<Resource> => {
  const next: Partial<Resource> = { ...base }
  Object.entries(delta).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    const resourceKey = key as keyof Resource
    next[resourceKey] = (next[resourceKey] ?? 0) + value
  })
  return next
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
  if (!canAffordFlatCost(player, scaledCost)) {
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

// ============================================
// Anytime Cookery Trades
// ============================================

const cookeryTrades: Record<string, Trade[]> = {
  Major_Fireplace1: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1' },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1' },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace1' },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1' },
  ],
  Major_Fireplace2: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2' },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2' },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace2' },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2' },
  ],
  Major_CookingHearth1: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_CookingHearth1' },
    { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1' },
    { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_CookingHearth1' },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1' },
  ],
  Major_CookingHearth2: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_CookingHearth2' },
    { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth2' },
    { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_CookingHearth2' },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth2' },
  ],
}

const getPlayerCookeryTrades = (player: PlayerState): Trade[] => {
  const trades: Trade[] = []
  for (const cardId of player.improvements) {
    const cardTrades = cookeryTrades[cardId]
    if (cardTrades) {
      trades.push(...cardTrades)
    }
  }
  return trades
}

const hasAffordableCookeryTrade = (player: PlayerState): boolean => {
  for (const cardId of player.improvements) {
    const cardTrades = cookeryTrades[cardId]
    if (!cardTrades) continue
    for (const trade of cardTrades) {
      if (canAffordTrade(player, trade, 1)) return true
    }
  }
  return false
}

const formatTradeLabel = (trade: Trade): string => {
  const fromKey = Object.keys(trade.from)[0] as ResourceKey
  const toKey = Object.keys(trade.to)[0] as ResourceKey
  const toAmount = trade.to[toKey] ?? 0
  return `${fromKey} → ${toAmount} ${toKey}`
}

const buildExchangeOptions = (player: PlayerState): ActionChoiceOption[] => {
  const trades = getPlayerCookeryTrades(player)
  const options: ActionChoiceOption[] = []
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i]
    if (!canAffordTrade(player, trade, 1)) continue
    const max = getMaxTradeTimes(player, trade)
    options.push({
      value: `trade:${i}:${max}`,
      labelKey: formatTradeLabel(trade),
    })
  }
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return options
}

const resolveExchangeChoice = (
  state: GameState,
  player: PlayerState,
  choice: string,
): ActionExecutionResult => {
  if (choice === 'cancel') {
    return { type: 'ok' }
  }
  if (choice.startsWith('bulk:')) {
    const trades = getPlayerCookeryTrades(player)
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    let gained: Partial<Resource> = {}
    payload.split(',').forEach((entry) => {
      const [indexStr, countStr] = entry.split('=')
      const index = Number(indexStr)
      const count = Number(countStr)
      if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 0) return
      const trade = trades[index]
      if (!trade) return
      const max = getMaxTradeTimes(player, trade)
      const times = Math.min(count, max)
      if (times > 0) {
        applyTrade(player, trade, times)
        gained = mergePositiveResources(gained, scaleResources(trade.to, times))
      }
    })
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained }
  }
  if (choice.startsWith('trade:')) {
    const parts = choice.split(':')
    const index = Number(parts[1])
    const trades = getPlayerCookeryTrades(player)
    const trade = trades[index]
    if (!trade) return { type: 'ok' }
    const count = parts[2] ? Number(parts[2]) : 1
    const max = getMaxTradeTimes(player, trade)
    const times = Math.min(count, max)
    if (times > 0) {
      applyTrade(player, trade, times)
    }
    const gained = times > 0 ? scaleResources(trade.to, times) : {}
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained }
  }
  return { type: 'ok' }
}

export const anytimeExchangeAction: ActionDefinition = {
  id: 'anytime-exchange',
  nameKey: 'actions.anytime-exchange.name',
  descriptionKey: 'actions.anytime-exchange.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  canBeExecutedByPlayer: (_, player) => hasAffordableCookeryTrade(player),
  execute: ({ player }) => ({
    type: 'choice',
    promptKey: 'ui.interactionExchangeChoice',
    options: buildExchangeOptions(player),
  }),
  resolveChoice: ({ state, player }, choice) => resolveExchangeChoice(state, player, choice),
}
