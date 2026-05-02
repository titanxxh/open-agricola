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
import { applyTradeSideEffect } from '../helpers/payment'
import { trackWorkPhaseBuildingResources } from '../../logic/work-phase-resources'
import { addFoodFromConversion, incResourceConverted } from '../../logic/stats'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
  type CardExchange,
  type ExchangeWindow,
} from '../../cards/types'
import { getMajorCardEffect } from '../../cards/major'
import { collectComputeExchanges } from '../../cards/card-listeners'

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

// ============================================
// Trade System (BGA-aligned)
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
// Anytime Cookery Trades (metadata-driven)
// ============================================

export const exchangeToTrade = (ex: CardExchange, fallbackId: string): Trade => ({
  from: ex.from,
  to: ex.to,
  max: ex.max,
  sourceId: ex.sourceId ?? fallbackId,
  sideEffect: ex.sideEffect,
})

const getCardExchanges = (cardId: string): readonly CardExchange[] => {
  const major = getMajorCardEffect(cardId)
  if (major?.exchanges) return major.exchanges
  const minor = getRegisteredMinorImprovement(cardId)
  if (minor?.exchanges) return minor.exchanges
  const occ = getRegisteredOccupation(cardId)
  if (occ?.exchanges) return occ.exchanges
  return []
}

const playedCardIds = (player: PlayerState): readonly string[] => [
  ...player.improvements,
  ...player.minorPlayed,
  ...player.occupationPlayed,
]

/**
 * Scan all played cards for exchanges visible in the given window.
 * Returns Trade-shaped entries (sourceId always populated).
 *
 * If `state` is provided, also runs `computeExchanges` listeners and appends
 * any runtime-derived trades (e.g. C62 CookeryExtension's doubled-food
 * harvest derivations). Old call sites that don't pass state continue to see
 * only metadata-driven trades.
 */
export const getExchangesInWindow = (
  player: PlayerState,
  window: ExchangeWindow,
  state?: GameState,
): Trade[] => {
  const out: Trade[] = []
  for (const cardId of playedCardIds(player)) {
    for (const ex of getCardExchanges(cardId)) {
      if ((ex.triggers ?? []).includes(window)) {
        out.push(exchangeToTrade(ex, cardId))
      }
    }
  }
  if (state) {
    out.push(...collectComputeExchanges(state, player, window))
  }
  return out
}

/**
 * Listener-driven exchange lookup: force-include exchanges whose `sourceId`
 * matches the supplied tradeIds, regardless of `triggers` (so triggers:[]
 * entries like E53 BoarSpear are still reachable via this path).
 */
export const getExchangesByTradeIds = (
  player: PlayerState,
  tradeIds: string[],
): Trade[] => {
  const out: Trade[] = []
  for (const cardId of playedCardIds(player)) {
    for (const ex of getCardExchanges(cardId)) {
      const sourceId = ex.sourceId ?? cardId
      if (tradeIds.includes(sourceId)) {
        out.push(exchangeToTrade(ex, cardId))
      }
    }
  }
  return out
}

const getPlayerCookeryTrades = (player: PlayerState, state?: GameState): Trade[] =>
  getExchangesInWindow(player, 'anytime', state)

const hasAffordableCookeryTrade = (player: PlayerState, state?: GameState): boolean => {
  for (const trade of getExchangesInWindow(player, 'anytime', state)) {
    if (canAffordTrade(player, trade, 1)) return true
  }
  return false
}

const hasAffordableTradeForIds = (
  player: PlayerState,
  tradeIds: string[],
  _state?: GameState,
): boolean => {
  for (const trade of getExchangesByTradeIds(player, tradeIds)) {
    if (canAffordTrade(player, trade, 1)) return true
  }
  return false
}

const formatTradeLabel = (trade: Trade): string => {
  const fromKey = Object.keys(trade.from)[0] as ResourceKey
  const toKey = Object.keys(trade.to)[0] as ResourceKey
  const toAmount = trade.to[toKey] ?? 0
  return `${fromKey} → ${toAmount} ${toKey}`
}

const buildTradeEffectPreview = (trade: Trade, times: number) => ({
  kind: 'resourceExchange' as const,
  resourcesPaid: scaleResources(trade.from, times),
  resourcesGained: scaleResources(trade.to, times),
})

const recordCookeryConversion = (
  player: PlayerState,
  trade: Trade,
  times: number,
) => {
  if (times <= 0) return
  const fromKey = (Object.keys(trade.from)[0] ?? null) as ResourceKey | null
  if (!fromKey) return
  const perFrom = trade.from[fromKey] ?? 0
  if (perFrom <= 0) return
  const totalFrom = perFrom * times
  incResourceConverted(player, fromKey, totalFrom)
  const foodOut = (trade.to.food ?? 0) * times
  if (foodOut > 0) {
    addFoodFromConversion(player, fromKey, foodOut)
  }
}

const buildExchangeOptions = (
  player: PlayerState,
  tradeIds?: string[],
  state?: GameState,
): { options: ActionChoiceOption[]; trades: Trade[] } => {
  // Anytime cookery first; if tradeIds provided, merge listener-driven trades
  // (these may have empty triggers, e.g. E53 BoarSpear).
  const trades: Trade[] = getPlayerCookeryTrades(player, state)
  if (tradeIds && tradeIds.length > 0) {
    const seen = new Set<string>()
    for (const t of trades) {
      const key = `${t.sourceId}|${JSON.stringify(t.from)}|${JSON.stringify(t.to)}`
      seen.add(key)
    }
    for (const t of getExchangesByTradeIds(player, tradeIds)) {
      const key = `${t.sourceId}|${JSON.stringify(t.from)}|${JSON.stringify(t.to)}`
      if (!seen.has(key)) {
        trades.push(t)
        seen.add(key)
      }
    }
  }
  const options: ActionChoiceOption[] = []
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i]
    if (!canAffordTrade(player, trade, 1)) continue
    const max = getMaxTradeTimes(player, trade)
    options.push({
      value: `trade:${i}:${max}`,
      labelKey: formatTradeLabel(trade),
      sourceCard: trade.sourceId,
      effectPreview: buildTradeEffectPreview(trade, max),
    })
  }
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return { options, trades }
}

const resolveExchangeChoice = (
  state: GameState,
  player: PlayerState,
  choice: string,
  tradeIds?: string[],
): ActionExecutionResult => {
  if (choice === 'cancel') {
    return { type: 'ok' }
  }
  const { trades } = buildExchangeOptions(player, tradeIds, state)
  if (choice.startsWith('bulk:')) {
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
        recordCookeryConversion(player, trade, times)
        if (trade.sideEffect) {
          applyTradeSideEffect(
            state,
            player,
            trade.sideEffect,
            times,
            trade.sourceId ?? trade.source ?? 'unknown',
          )
        }
        gained = mergePositiveResources(gained, scaleResources(trade.to, times))
      }
    })
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained }
  }
  if (choice.startsWith('trade:')) {
    const parts = choice.split(':')
    const index = Number(parts[1])
    const trade = trades[index]
    if (!trade) return { type: 'ok' }
    const count = parts[2] ? Number(parts[2]) : 1
    const max = getMaxTradeTimes(player, trade)
    const times = Math.min(count, max)
    if (times > 0) {
      applyTrade(player, trade, times)
      recordCookeryConversion(player, trade, times)
      if (trade.sideEffect) {
        applyTradeSideEffect(
          state,
          player,
          trade.sideEffect,
          times,
          trade.sourceId ?? trade.source ?? 'unknown',
        )
      }
    }
    const gained = times > 0 ? scaleResources(trade.to, times) : {}
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained }
  }
  return { type: 'ok' }
}

export const anytimeExchangeAction: ActionDefinition = {
  id: 'exchange',
  nameKey: 'actions.exchange.name',
  descriptionKey: 'actions.exchange.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  canBeExecutedByPlayer: (state, player, ctx) => {
    const tradeIds = (ctx?.actionContext as { tradeIds?: string[] } | undefined)?.tradeIds
    if (tradeIds && tradeIds.length > 0) {
      return hasAffordableTradeForIds(player, tradeIds, state) || hasAffordableCookeryTrade(player, state)
    }
    return hasAffordableCookeryTrade(player, state)
  },
  execute: ({ state, player, actionContext }) => {
    const filterIds = actionContext?.tradeIds as string[] | undefined
    const { options: allOptions } = buildExchangeOptions(player, filterIds, state)
    const filtered = filterIds && filterIds.length > 0
      ? allOptions.filter((opt) => {
          if (opt.value === 'cancel') return true
          return typeof opt.sourceCard === 'string' && filterIds.includes(opt.sourceCard)
        })
      : allOptions

    const hasTradeOption = filtered.some((opt) => opt.value !== 'cancel')
    if (filterIds && filterIds.length > 0 && !hasTradeOption) {
      return { type: 'fail' as const, logKey: 'log.actionNoExchange' }
    }

    return {
      type: 'choice' as const,
      promptKey: 'ui.interactionExchangeChoice',
      options: filtered,
    }
  },
  resolveChoice: ({ state, player, actionContext }, choice) =>
    resolveExchangeChoice(state, player, choice, actionContext?.tradeIds as string[] | undefined),
}
