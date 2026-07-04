import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
  Resource,
  ResourceBatchExchangePayload,
  Trade,
  ResourceKey,
} from '../../contract/types'
import type { DraftGameEvent, EventSink } from '../../contract/events'
import type { PromptKey } from '../../contract/prompt-keys'
import { PaymentSolver } from '../payment'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { addFoodFromConversion, incResourceConverted } from '../../session/stats'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../../cards/registry-display'
import type { CardExchange, ExchangeWindow } from '../../contract/cards'
import { getMajorCard } from '../../cards/major'
import { collectComputeExchanges } from '../../cards/card-listeners'
import { isMajorCardId } from '../../cards/helpers/card-type'
import { dispatchTradeAppliedListener } from '../helpers/trade-applied-listener'
import { exchangeToTrade } from '../helpers/trades'
import {
  applyAnimalPayment,
  isAnimalResourceKey,
  readAnimalPaymentPreference,
  type AnimalPaymentPreference,
} from '../../domain/animal-payment'

const readMaxTradeTimesBySourceId = (
  actionContext: Record<string, unknown> | undefined,
): Record<string, number> | undefined => {
  const raw = actionContext?.maxTradeTimesBySourceId
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[key] = Math.max(0, Math.floor(value))
  }
  return out
}

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

const emitResourceExchanged = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  trade: Trade,
  times: number,
): DraftGameEvent<'resource.exchanged'> | undefined => {
  if (times <= 0) return undefined
  const paid = scaleResources(trade.from, times)
  const gained = scaleResources(trade.to, times)
  if (Object.keys(paid).length === 0 && Object.keys(gained).length === 0) return undefined
  const exchangeSource = trade.sourceId ?? trade.source
  const event: DraftGameEvent<'resource.exchanged'> = {
    type: 'resource.exchanged',
    paid,
    gained,
    paidFrom: { kind: 'player', playerId: player.id },
    paidTo: { kind: 'supply' },
    gainedFrom: { kind: 'supply' },
    gainedTo: { kind: 'player', playerId: player.id },
    ...(exchangeSource ? { exchangeSource } : {}),
    times,
  }
  eventSink?.emit<'resource.exchanged'>(event)
  return event
}

const readDirectTrade = (actionContext: Record<string, unknown> | undefined): Trade | undefined => {
  const value = actionContext?.directTrade
  if (!value || typeof value !== 'object') return undefined
  const trade = value as Partial<Trade>
  if (!trade.from || !trade.to) return undefined
  return trade as Trade
}

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
type BuildingResource = typeof BUILDING_RESOURCES[number]

const isBuildingResource = (key: string): key is BuildingResource =>
  BUILDING_RESOURCES.includes(key as BuildingResource)

const normalizeBatchExchange = (
  discard: Partial<Record<keyof Resource, number>>,
  receive: Partial<Record<keyof Resource, number>>,
): { paid: Partial<Resource>; gained: Partial<Resource> } => {
  const paid: Partial<Resource> = {}
  const gained: Partial<Resource> = {}
  for (const key of BUILDING_RESOURCES) {
    const d = Math.max(0, Math.floor(discard[key] ?? 0))
    const r = Math.max(0, Math.floor(receive[key] ?? 0))
    if (d > r) paid[key] = d - r
    if (r > d) gained[key] = r - d
  }
  return { paid, gained }
}

const sumBuildingResources = (
  resources: Partial<Record<keyof Resource, number>>,
): number =>
  BUILDING_RESOURCES.reduce((sum, key) =>
    sum + Math.max(0, Math.floor(resources[key] ?? 0)), 0)

const resolveBatchExchange = (
  state: GameState,
  player: PlayerState,
  batch: { cardId: string; maxTotal: number; requireAtLeastOne?: boolean },
  payload: ResourceBatchExchangePayload,
  eventSink?: EventSink,
): ActionExecutionResult => {
  const discard = payload.discard ?? {}
  const receive = payload.receive ?? {}
  const discardTotal = sumBuildingResources(discard)
  const receiveTotal = sumBuildingResources(receive)
  if (discardTotal > batch.maxTotal || receiveTotal > batch.maxTotal) {
    return { type: 'fail', errorKey: 'exchange.batch.too-many' }
  }
  if (discardTotal !== receiveTotal) {
    return { type: 'fail', errorKey: 'exchange.batch.total-mismatch' }
  }
  if (batch.requireAtLeastOne && discardTotal === 0) {
    return { type: 'fail', errorKey: 'exchange.batch.empty' }
  }
  for (const [key, value] of Object.entries(discard)) {
    if (!isBuildingResource(key)) return { type: 'fail', errorKey: 'exchange.batch.invalid-discard' }
    const amount = Math.max(0, Math.floor(value ?? 0))
    if (amount > player.resources[key]) return { type: 'fail', errorKey: 'exchange.batch.not-enough' }
  }
  for (const key of Object.keys(receive)) {
    if (!isBuildingResource(key)) return { type: 'fail', errorKey: 'exchange.batch.invalid-receive' }
  }
  const { paid, gained } = normalizeBatchExchange(discard, receive)
  if (Object.keys(paid).length === 0 && Object.keys(gained).length === 0) {
    return { type: 'ok' }
  }
  const preResources = { ...player.resources }
  for (const [key, amount] of Object.entries(paid)) {
    player.resources[key as keyof Resource] -= amount ?? 0
  }
  for (const [key, amount] of Object.entries(gained)) {
    player.resources[key as keyof Resource] += amount ?? 0
  }
  const event: DraftGameEvent<'resource.exchanged'> = {
    type: 'resource.exchanged',
    paid,
    gained,
    paidFrom: { kind: 'player', playerId: player.id },
    paidTo: { kind: 'supply' },
    gainedFrom: { kind: 'supply' },
    gainedTo: { kind: 'player', playerId: player.id },
    sourceCardId: batch.cardId,
    exchangeSource: batch.cardId,
    times: 1,
  }
  eventSink?.emit<'resource.exchanged'>(event)
  dispatchTradeAppliedListener(
    state,
    player,
    { from: paid, to: gained, sourceId: batch.cardId },
    1,
    eventSink,
    [event],
    preResources,
  )
  trackWorkPhaseBuildingResources(state, player.id, gained)
  return { type: 'ok', resourcesPaid: paid, resourcesGained: gained }
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
    return (player.resources[key] ?? 0) >= requiredAmount
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
        (player.resources[key] ?? 0) / requiredPerTrade,
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
  animalPaymentPreference?: AnimalPaymentPreference,
  state?: GameState,
): void => {
  // Deduct 'from' resources
  const fromKeys = Object.keys(trade.from) as ResourceKey[]
  for (const key of fromKeys) {
    const amount = (trade.from[key] ?? 0) * times
    if (amount > 0 && isAnimalResourceKey(key)) {
      applyAnimalPayment(
        player,
        state,
        key,
        amount,
        animalPaymentPreference?.animal === key ? animalPaymentPreference : undefined,
      )
    } else {
      player.resources[key] -= amount
    }
  }

  // Add 'to' resources
  const toKeys = Object.keys(trade.to) as ResourceKey[]
  for (const key of toKeys) {
    const amount = (trade.to[key] ?? 0) * times
    player.resources[key] += amount
  }
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

const getCardExchanges = (cardId: string, state?: GameState): readonly CardExchange[] => {
  if (isMajorCardId(cardId)) {
    const major = getMajorCard(cardId)
    if (major?.requiresFarmersOfTheMoor && state !== undefined && state.enableFarmersOfTheMoor !== true) return []
    if (major?.exchanges) return major.exchanges
  }
  const minor = getRegisteredMinorImprovement(cardId)
  if (minor?.requiresFarmersOfTheMoor && state !== undefined && state.enableFarmersOfTheMoor !== true) return []
  if (minor?.exchanges) return minor.exchanges
  const occ = getRegisteredOccupation(cardId)
  if (occ?.requiresFarmersOfTheMoor && state !== undefined && state.enableFarmersOfTheMoor !== true) return []
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
    for (const ex of getCardExchanges(cardId, state)) {
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
  maxTradeTimesBySourceId?: Record<string, number>,
): boolean => {
  for (const trade of getExchangesByTradeIds(player, tradeIds)) {
    const sourceId = trade.sourceId ?? trade.source
    const contextMax = sourceId ? maxTradeTimesBySourceId?.[sourceId] : undefined
    if (contextMax !== undefined && contextMax <= 0) continue
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
  maxTradeTimesBySourceId?: Record<string, number>,
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
    const sourceId = trade.sourceId ?? trade.source
    const contextMax = sourceId ? maxTradeTimesBySourceId?.[sourceId] : undefined
    const max = Math.min(getMaxTradeTimes(player, trade), contextMax ?? Infinity)
    if (max <= 0) continue
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
  actionContext?: Record<string, unknown>,
  eventSink?: EventSink,
): ActionExecutionResult => {
  if (choice === 'cancel') {
    return { type: 'ok' }
  }
  const tradeIds = actionContext?.tradeIds as string[] | undefined
  const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(actionContext)
  const animalPaymentPreference = readAnimalPaymentPreference(actionContext)
  const { trades } = buildExchangeOptions(player, tradeIds, state, maxTradeTimesBySourceId)
  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    let gained: Partial<Resource> = {}
    let paid: Partial<Resource> = {}
    payload.split(',').forEach((entry) => {
      const [indexStr, countStr] = entry.split('=')
      const index = Number(indexStr)
      const count = Number(countStr)
      if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 0) return
      const trade = trades[index]
      if (!trade) return
      const sourceId = trade.sourceId ?? trade.source
      const contextMax = sourceId ? maxTradeTimesBySourceId?.[sourceId] : undefined
      const max = Math.min(getMaxTradeTimes(player, trade), contextMax ?? Infinity)
      const times = Math.min(count, max)
      if (times > 0) {
        const preResources = { ...player.resources }
        applyTrade(player, trade, times, animalPaymentPreference, state)
        recordCookeryConversion(player, trade, times)
        if (trade.sideEffect) {
          PaymentSolver.applyTradeSideEffect(
            state,
            player,
            trade.sideEffect,
            times,
            trade.sourceId ?? trade.source ?? 'unknown',
          )
        }
        const exchangeEvent = emitResourceExchanged(eventSink, player, trade, times)
        dispatchTradeAppliedListener(
          state,
          player,
          trade,
          times,
          eventSink,
          exchangeEvent ? [exchangeEvent] : [],
          preResources,
        )
        paid = mergePositiveResources(paid, scaleResources(trade.from, times))
        gained = mergePositiveResources(gained, scaleResources(trade.to, times))
      }
    })
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained, resourcesPaid: paid }
  }
  if (choice.startsWith('trade:')) {
    const parts = choice.split(':')
    const index = Number(parts[1])
    const trade = trades[index]
    if (!trade) return { type: 'ok' }
    const count = parts[2] ? Number(parts[2]) : 1
    const max = getMaxTradeTimes(player, trade)
    const sourceId = trade.sourceId ?? trade.source
    const contextMax = sourceId ? maxTradeTimesBySourceId?.[sourceId] : undefined
    const boundedMax = Math.min(max, contextMax ?? Infinity)
    const times = Math.min(count, boundedMax)
    if (times > 0) {
      const preResources = { ...player.resources }
      applyTrade(player, trade, times, animalPaymentPreference, state)
      recordCookeryConversion(player, trade, times)
      if (trade.sideEffect) {
        PaymentSolver.applyTradeSideEffect(
          state,
          player,
          trade.sideEffect,
          times,
          trade.sourceId ?? trade.source ?? 'unknown',
        )
      }
      const exchangeEvent = emitResourceExchanged(eventSink, player, trade, times)
      dispatchTradeAppliedListener(
        state,
        player,
        trade,
        times,
        eventSink,
        exchangeEvent ? [exchangeEvent] : [],
        preResources,
      )
    }
    const gained = times > 0 ? scaleResources(trade.to, times) : {}
    const paid = times > 0 ? scaleResources(trade.from, times) : {}
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok', resourcesGained: gained, resourcesPaid: paid }
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
    const batch = ctx?.actionContext?.batchExchange as { maxTotal?: number } | undefined
    if (batch) {
      return BUILDING_RESOURCES.some((resource) => (player.resources[resource] ?? 0) > 0)
    }
    const directTrade = readDirectTrade(ctx?.actionContext)
    if (directTrade) return canAffordTrade(player, directTrade, 1)
    const tradeIds = (ctx?.actionContext as { tradeIds?: string[] } | undefined)?.tradeIds
    const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(ctx?.actionContext)
    if (tradeIds && tradeIds.length > 0) {
      return hasAffordableTradeForIds(player, tradeIds, state, maxTradeTimesBySourceId) || hasAffordableCookeryTrade(player, state)
    }
    return hasAffordableCookeryTrade(player, state)
  },
  execute: ({ state, player, actionContext, eventSink }) => {
    const batch = actionContext?.batchExchange as
      | { cardId: string; maxTotal: number; promptKey?: PromptKey; requireAtLeastOne?: boolean }
      | undefined
    if (batch) {
      const discardAvailableByResource = Object.fromEntries(
        BUILDING_RESOURCES.map((key) => [key, Math.min(player.resources[key] ?? 0, batch.maxTotal)]),
      ) as Partial<Record<keyof Resource, number>>
      return {
        type: 'request' as const,
        request: {
          kind: 'resource-batch-exchange-select' as const,
          cardId: batch.cardId,
          discardAvailableByResource,
          receiveResources: BUILDING_RESOURCES,
          maxTotal: batch.maxTotal,
          promptKey: batch.promptKey,
          requireAtLeastOne: batch.requireAtLeastOne,
        },
        promptKey: batch.promptKey ?? 'ui.interactionSleightOfHand',
      }
    }
    const directTrade = readDirectTrade(actionContext)
    if (directTrade) {
      if (!canAffordTrade(player, directTrade, 1)) {
        return { type: 'fail', errorKey: 'log.actionNoExchange' }
      }
      const animalPaymentPreference = readAnimalPaymentPreference(actionContext)
      const preResources = { ...player.resources }
      applyTrade(player, directTrade, 1, animalPaymentPreference, state)
      recordCookeryConversion(player, directTrade, 1)
      if (directTrade.sideEffect) {
        PaymentSolver.applyTradeSideEffect(
          state,
          player,
          directTrade.sideEffect,
          1,
          directTrade.sourceId ?? directTrade.source ?? 'unknown',
        )
      }
      const exchangeEvent = emitResourceExchanged(eventSink, player, directTrade, 1)
      dispatchTradeAppliedListener(
        state,
        player,
        directTrade,
        1,
        eventSink,
        exchangeEvent ? [exchangeEvent] : [],
        preResources,
      )
      const gained = scaleResources(directTrade.to, 1)
      const paid = scaleResources(directTrade.from, 1)
      trackWorkPhaseBuildingResources(state, player.id, gained)
      return { type: 'ok' as const, resourcesGained: gained, resourcesPaid: paid }
    }
    const filterIds = actionContext?.tradeIds as string[] | undefined
    const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(actionContext)
    const { options: allOptions } = buildExchangeOptions(player, filterIds, state, maxTradeTimesBySourceId)
    const filtered = filterIds && filterIds.length > 0
      ? allOptions.filter((opt) => {
          if (opt.value === 'cancel') return true
          return typeof opt.sourceCard === 'string' && filterIds.includes(opt.sourceCard)
        })
      : allOptions

    const hasTradeOption = filtered.some((opt) => opt.value !== 'cancel')
    if (filterIds && filterIds.length > 0 && !hasTradeOption) {
      return { type: 'fail', errorKey: 'log.actionNoExchange' }
    }

    return {
      type: 'request' as const,
      request: { kind: 'choice' as const, options: filtered, structuredChoicePrefixes: ['bulk:'] },
      promptKey: 'ui.interactionExchangeChoice',
    }
  },
  resolveChoice: ({ state, player, actionContext, eventSink }, choice, payload) => {
    const batch = actionContext?.batchExchange as
      | { cardId: string; maxTotal: number; requireAtLeastOne?: boolean }
      | undefined
    const batchPayload = payload?.resourceBatchExchange as ResourceBatchExchangePayload | undefined
    if (batch && batchPayload) {
      return resolveBatchExchange(state, player, batch, batchPayload, eventSink)
    }
    return resolveExchangeChoice(state, player, choice, actionContext, eventSink)
  },
}
