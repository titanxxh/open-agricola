import type { ActionHookRegistry } from '../hooks'
import type {
  ActionChoiceOption,
  ActionDefinition,
  InteractionRequest,
  ActionExecutionResult,
  GameState,
  PlayerState,
  Resource,
  ResourceBatchExchangePayload,
  Trade,
  ResourceKey,
  FeedExchangeCatalogEntry,
  ExchangeBatchEntry,
  InternalActionChildren,
} from '../../contract/types'
import type { DraftGameEvent, EventSink } from '../../contract/events'
import type { PromptKey } from '../../contract/prompt-keys'
import { PaymentSolver } from '../payment'
import { animalKeysForState } from '../../contract/animals'
import { REAL_RESOURCE_KEYS } from '../../contract/resource-keys'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { addFoodFromConversion, incResourceConverted } from '../../session/stats'
import type { ExchangeWindow } from '../../contract/cards'
import { collectComputeExchanges } from '../../cards/card-listeners'
import { BASIC_CONVERSION_SOURCE_ID, basicConversionExchanges } from '../../cards/basic-conversion'
import { dispatchTradeAppliedListener } from '../helpers/trade-applied-listener'
import { exchangeToTrade } from '../helpers/trades'
import { getPlacedAnimalsByType } from '../../domain/animal-zones'
import { getCardExchanges, getRemainingHarvestExchangeUses, recordHarvestExchangeUses } from '../helpers/exchange-recipes'
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
  actionHooks?: ActionHookRegistry,
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
    actionHooks,
  )
  trackWorkPhaseBuildingResources(state, player.id, gained)
  return { type: 'ok', resourcesPaid: paid, resourcesGained: gained }
}

// ============================================
// Trade System (the reference-aligned)
// ============================================

const isTradeAllowedDuringPhase = (trade: Trade, state?: GameState): boolean =>
  state?.roundPhase !== 'breeding'
  || (trade.to.food ?? 0) <= 0
  || !animalKeysForState(state).some(animal => (trade.from[animal] ?? 0) > 0)

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
  state?: GameState,
): boolean => {
  if (!isTradeAllowedDuringPhase(trade, state)) return false
  const fromResources = trade.from
  const resourceKeys = Object.keys(fromResources) as ResourceKey[]

  const placed = trade.fromFarmyard && state ? getPlacedAnimalsByType(player, state) : undefined
  return resourceKeys.every((key) => {
    const requiredAmount = (fromResources[key] ?? 0) * times
    if (trade.fromFarmyard && isAnimalResourceKey(key) && (placed?.[key] ?? 0) < requiredAmount) return false
    return (player.resources[key] ?? 0) >= requiredAmount
  })
}

/**
 * Get the maximum number of times a trade can be applied
 * @param player - Player state
 * @param trade - Trade definition with optional max limit
 * @returns Maximum times the trade can be applied
 */
export const getMaxTradeTimes = (player: PlayerState, trade: Trade, state?: GameState): number => {
  if (!isTradeAllowedDuringPhase(trade, state)) return 0
  const fromResources = trade.from
  const resourceKeys = Object.keys(fromResources) as ResourceKey[]

  // Calculate max times based on player resources
  let maxFromResources = Infinity
  const placed = trade.fromFarmyard && state ? getPlacedAnimalsByType(player, state) : undefined
  for (const key of resourceKeys) {
    const requiredPerTrade = fromResources[key] ?? 0
    if (requiredPerTrade > 0) {
      const timesFromThisResource = Math.floor(
        Math.min(player.resources[key] ?? 0, trade.fromFarmyard && isAnimalResourceKey(key) ? placed?.[key] ?? 0 : Infinity) / requiredPerTrade,
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

const playedCardIds = (player: PlayerState): readonly string[] => [
  ...player.improvements,
  ...player.minorPlayed,
  ...player.occupationPlayed,
]

type ResolvedExchange = FeedExchangeCatalogEntry & {
  trade: Trade
  window: ExchangeWindow
}

export const getExchangeCatalog = ({
  player, windows, state, actionHooks, includeBasicConversions = false,
}: {
  player: PlayerState
  windows: readonly ExchangeWindow[]
  state?: GameState
  actionHooks?: ActionHookRegistry
  includeBasicConversions?: boolean
}): ResolvedExchange[] => {
  const entries: ResolvedExchange[] = []
  const add = (trade: Trade, exchangeIndex: number, window: ExchangeWindow) => {
    const sourceId = trade.sourceId ?? trade.source
    if (!sourceId) return
    entries.push({ sourceId, exchangeIndex, from: { ...trade.from }, to: { ...trade.to },
      max: trade.max, fromFarmyard: trade.fromFarmyard, trade, window })
  }
  if (includeBasicConversions && windows.includes('anytime')) {
    basicConversionExchanges.forEach((exchange, index) =>
      add(exchangeToTrade(exchange, BASIC_CONVERSION_SOURCE_ID), index, 'anytime'))
  }
  for (const cardId of playedCardIds(player)) {
    getCardExchanges(cardId, state).forEach((exchange, exchangeIndex) => {
      const triggers = exchange.triggers ?? []
      const window = windows.find((candidate) => triggers.includes(candidate))
      if (!window) return
      add(exchangeToTrade(exchange, cardId), exchangeIndex, window)
    })
  }
  const nextIndexBySource = new Map<string, number>()
  for (const entry of entries) {
    nextIndexBySource.set(entry.sourceId, Math.max(nextIndexBySource.get(entry.sourceId) ?? 0, entry.exchangeIndex + 1))
  }
  if (state) {
    for (const window of windows) {
      for (const trade of collectComputeExchanges(state, player, window, actionHooks)) {
        const sourceId = trade.sourceId ?? trade.source
        if (!sourceId) continue
        const exchangeIndex = nextIndexBySource.get(sourceId) ?? 0
        nextIndexBySource.set(sourceId, exchangeIndex + 1)
        add(trade, exchangeIndex, window)
      }
    }
  }
  return entries.filter((entry) => isTradeAllowedDuringPhase(entry.trade, state))
}

export const getFeedExchangeCatalog = (player: PlayerState, state: GameState, actionHooks?: ActionHookRegistry) =>
  getExchangeCatalog({ player, windows: ['harvest', 'anytime'], state, actionHooks, includeBasicConversions: true })

export const getExchangesInWindow = (
  player: PlayerState,
  window: ExchangeWindow,
  state?: GameState,
  actionHooks?: ActionHookRegistry,
): Trade[] => getExchangeCatalog({ player, windows: [window], state, actionHooks }).map((entry) => entry.trade)

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

const isTradeAllowed = (trade: Trade, state: GameState | undefined, actionContext?: Record<string, unknown>): boolean => {
  const interactionKind = actionContext?.anytimeInteractionKind as InteractionRequest['kind'] | undefined
  return isTradeAllowedDuringPhase(trade, state)
    && (!interactionKind || !trade.blockedAnytimeInteractionKinds?.includes(interactionKind))
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
  for (const resource of REAL_RESOURCE_KEYS) {
    incResourceConverted(player, resource, (trade.from[resource] ?? 0) * times)
  }
  const foodOut = (trade.to.food ?? 0) * times
  if (foodOut > 0) {
    addFoodFromConversion(player, fromKey, foodOut)
  }
}

export type { ExchangeBatchEntry } from '../../contract/types'

export type ExchangeRecipeReceipt = {
  sourceId: string | undefined
  times: number
  preResources: Resource
  paid: Partial<Resource>
  gained: Partial<Resource>
}

export type ExchangeBatchResult =
  | {
      type: 'ok'
      resourcesPaid: Partial<Resource>
      resourcesGained: Partial<Resource>
      extraData: { exchangeBatch: ExchangeRecipeReceipt[] }
      internalChildren?: InternalActionChildren
    }
  | Extract<ActionExecutionResult, { type: 'fail' }>

type ExchangeBatchInput = {
  state: GameState
  player: PlayerState
  entries: readonly ExchangeBatchEntry[]
  maxTradeTimesBySourceId?: Readonly<Record<string, number>>
}

/** Plans use only direct recipe credits, before listeners can award goods. */
export const validateExchangeBatch = ({
  state, player, entries, maxTradeTimesBySourceId,
}: ExchangeBatchInput): boolean => {
  const resources = { ...player.resources }
  const placedAnimals = getPlacedAnimalsByType(player, state)
  const recipeUses = new Map<string, number>()
  const sourceUses = new Map<string, number>()
  const harvestUses = new Map<string, number>()
  for (const { trade, count, harvestRound } of entries) {
    if (!Number.isSafeInteger(count) || count <= 0 || !isTradeAllowedDuringPhase(trade, state)) return false
    const recipeKey = JSON.stringify(trade)
    const used = (recipeUses.get(recipeKey) ?? 0) + count
    if (used > (trade.max ?? Infinity)) return false
    recipeUses.set(recipeKey, used)
    const sourceId = trade.sourceId ?? trade.source
    if (sourceId) {
      const sourceUsed = (sourceUses.get(sourceId) ?? 0) + count
      if (sourceUsed > (maxTradeTimesBySourceId?.[sourceId] ?? Infinity)) return false
      sourceUses.set(sourceId, sourceUsed)
      if (harvestRound !== undefined && trade.max !== undefined) {
        const harvestUsed = (harvestUses.get(sourceId) ?? 0) + count
        if (harvestUsed > getRemainingHarvestExchangeUses(player, sourceId, trade.max, harvestRound)) return false
        harvestUses.set(sourceId, harvestUsed)
      }
    }
    for (const resource of REAL_RESOURCE_KEYS) {
      const amount = (trade.from[resource] ?? 0) * count
      if (amount > (resources[resource] ?? 0)) return false
      if (isAnimalResourceKey(resource)) {
        if (trade.fromFarmyard && amount > (placedAnimals[resource] ?? 0)) return false
        placedAnimals[resource] = Math.max(0, (placedAnimals[resource] ?? 0) - amount)
      }
      resources[resource] = (resources[resource] ?? 0) - amount
    }
    for (const resource of REAL_RESOURCE_KEYS) {
      resources[resource] = (resources[resource] ?? 0) + (trade.to[resource] ?? 0) * count
    }
  }

  return true
}

export const executeExchangeBatch = ({
  state, player, entries, maxTradeTimesBySourceId,
  animalPaymentPreference, eventSink, actionHooks, harvestFeed, reorganizeAnimals = true,
}: ExchangeBatchInput & {
  animalPaymentPreference?: AnimalPaymentPreference
  eventSink?: EventSink
  actionHooks?: ActionHookRegistry
  harvestFeed?: true
  reorganizeAnimals?: boolean
}): ExchangeBatchResult => {
  if (!validateExchangeBatch({ state, player, entries, maxTradeTimesBySourceId })) {
    return { type: 'fail', errorKey: 'log.actionNoExchange', recoverable: true }
  }
  let paid: Partial<Resource> = {}
  let gained: Partial<Resource> = {}
  const receipts: ExchangeRecipeReceipt[] = []
  for (const { trade, count, harvestRound } of entries) {
    const preResources = { ...player.resources }
    const sourceId = trade.sourceId ?? trade.source
    applyTrade(player, trade, count, animalPaymentPreference, state)
    recordCookeryConversion(player, trade, count)
    if (trade.sideEffect) {
      PaymentSolver.applyTradeSideEffect(state, player, trade.sideEffect, count, sourceId ?? 'unknown')
    }
    const exchangeEvent = emitResourceExchanged(eventSink, player, trade, count)
    if (harvestFeed && sourceId) {
      eventSink?.emit<'harvest.feedConverted'>({
        type: 'harvest.feedConverted', playerId: player.id, source: sourceId,
        cost: scaleResources(trade.from, count), food: scaleResources(trade.to, count),
      })
    }
    dispatchTradeAppliedListener(state, player, trade, count, eventSink,
      exchangeEvent ? [exchangeEvent] : [], preResources, actionHooks)
    if (harvestRound !== undefined && trade.max !== undefined && sourceId) {
      recordHarvestExchangeUses(player, sourceId, harvestRound, count)
    }
    const receipt = {
      sourceId, times: count, preResources,
      paid: scaleResources(trade.from, count), gained: scaleResources(trade.to, count),
    }
    receipts.push(receipt)
    paid = mergePositiveResources(paid, receipt.paid)
    gained = mergePositiveResources(gained, receipt.gained)
  }
  trackWorkPhaseBuildingResources(state, player.id, gained)
  const placed = getPlacedAnimalsByType(player, state)
  const needsReorganization = reorganizeAnimals && animalKeysForState(state).some((key) =>
    (gained[key] ?? 0) > 0 && (player.resources[key] ?? 0) > (placed[key] ?? 0),
  )
  return {
    type: 'ok', resourcesPaid: paid, resourcesGained: gained, extraData: { exchangeBatch: receipts },
    ...(needsReorganization ? {
      internalChildren: { afterHostListeners: [{ actionId: 'reorganize', actionContext: { onlyIfUnplaced: true } }] },
    } : {}),
  }
}

const buildExchangeOptions = (
  player: PlayerState,
  tradeIds?: string[],
  state?: GameState,
  maxTradeTimesBySourceId?: Record<string, number>,
  actionContext?: Record<string, unknown>,
  actionHooks?: ActionHookRegistry,
): { options: ActionChoiceOption[]; trades: Trade[]; harvestRounds: Map<number, number> } => {
  // Anytime cookery first; if tradeIds provided, merge listener-driven trades
  // (these may have empty triggers, e.g. E53 BoarSpear).
  const harvestAllowed = state?.roundPhase === 'harvest' || state?.roundPhase === 'feeding' ||
    typeof actionContext?.harvestExchangeRound === 'number'
  const catalog = getExchangeCatalog({ player, windows: harvestAllowed ? ['anytime', 'harvest'] : ['anytime'], state, actionHooks })
  const trades: Trade[] = catalog.map((entry) => entry.trade)
  const harvestRounds = new Map<number, number>()
  if (state) catalog.forEach((entry, index) => {
    if (entry.window === 'harvest') harvestRounds.set(index, state.round)
  })
  if (actionContext?.includeBasicConversions === true) {
    trades.push(...basicConversionExchanges.map(exchange => exchangeToTrade(exchange, BASIC_CONVERSION_SOURCE_ID)))
  }
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
    if (!isTradeAllowed(trade, state, actionContext) || !canAffordTrade(player, trade, 1, state)) continue
    const sourceId = trade.sourceId ?? trade.source
    const contextMax = sourceId ? maxTradeTimesBySourceId?.[sourceId] : undefined
    const harvestRound = harvestRounds.get(i)
    const remaining = sourceId && harvestRound !== undefined
      ? getRemainingHarvestExchangeUses(player, sourceId, trade.max, harvestRound) : Infinity
    const max = Math.min(getMaxTradeTimes(player, trade, state), contextMax ?? Infinity, remaining)
    if (max <= 0) continue
    options.push({
      value: `trade:${i}:${max}`,
      labelKey: formatTradeLabel(trade),
      sourceCard: trade.sourceId,
      effectPreview: buildTradeEffectPreview(trade, max),
    })
  }
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return { options, trades, harvestRounds }
}

const resolveExchangeChoice = (
  state: GameState,
  player: PlayerState,
  choice: string,
  actionContext?: Record<string, unknown>,
  eventSink?: EventSink,
  actionHooks?: ActionHookRegistry,
): ActionExecutionResult => {
  if (choice === 'cancel') {
    return { type: 'ok' }
  }
  const tradeIds = actionContext?.tradeIds as string[] | undefined
  const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(actionContext)
  const animalPaymentPreference = readAnimalPaymentPreference(actionContext)
  const { trades, harvestRounds } = buildExchangeOptions(player, tradeIds, state, maxTradeTimesBySourceId, actionContext, actionHooks)
  const allowedTrade = (trade: Trade): boolean => isTradeAllowed(trade, state, actionContext)
    && (!tradeIds?.length || tradeIds.includes(trade.sourceId ?? trade.source ?? ''))
  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    const requestedTrades: ExchangeBatchEntry[] = []
    for (const entry of payload.split(',')) {
      const parts = entry.split('=')
      const index = Number(parts[0])
      const count = Number(parts[1])
      const trade = trades[index]
      if (parts.length !== 2 || parts[0].trim() === ''
        || !Number.isSafeInteger(index) || index < 0
        || !Number.isSafeInteger(count) || count <= 0
        || !trade || !allowedTrade(trade)) {
        return { type: 'fail', errorKey: 'log.actionNoExchange', recoverable: true }
      }
      const harvestRound = harvestRounds.get(index)
      requestedTrades.push({ trade, count, ...(harvestRound !== undefined ? { harvestRound } : {}) })
    }
    return executeExchangeBatch({
      state, player, entries: requestedTrades, maxTradeTimesBySourceId,
      animalPaymentPreference, eventSink, actionHooks,
      reorganizeAnimals: actionContext?.anytimeInteractionKind !== 'animal-reorg',
    })
  }
  if (choice.startsWith('trade:')) {
    const parts = choice.split(':')
    const index = Number(parts[1])
    const trade = trades[index]
    const count = parts.length === 2 ? 1 : Number(parts[2])
    if ((parts.length !== 2 && parts.length !== 3) || parts[1].trim() === ''
      || !Number.isSafeInteger(index) || index < 0
      || !Number.isSafeInteger(count) || count <= 0
      || !trade || !allowedTrade(trade)) {
      return { type: 'fail', errorKey: 'log.actionNoExchange', recoverable: true }
    }
    const harvestRound = harvestRounds.get(index)
    return executeExchangeBatch({
      state, player, entries: [{ trade, count,
        ...(harvestRound !== undefined ? { harvestRound } : {}),
      }], maxTradeTimesBySourceId,
      animalPaymentPreference, eventSink, actionHooks,
      reorganizeAnimals: actionContext?.anytimeInteractionKind !== 'animal-reorg',
    })
  }
  return { type: 'ok' }
}

const batchExchangeAvailability = (player: PlayerState, maxTotal: number): Partial<Resource> => {
  const available: Partial<Resource> = {}
  for (const resource of BUILDING_RESOURCES) available[resource] = Math.min(player.resources[resource] ?? 0, maxTotal)
  return available
}

export const anytimeExchangeAction: ActionDefinition = {
  id: 'exchange',
  nameKey: 'actions.exchange.name',
  descriptionKey: 'actions.exchange.description',
  roundAvailable: 1,
  gainPerRound: {},
  previewEffect: ({ state, player, actionContext, actionHooks }) => {
    const batch = actionContext?.batchExchange
    if (batch && typeof batch === 'object' && 'maxTotal' in batch && typeof batch.maxTotal === 'number') {
      const available = batchExchangeAvailability(player, batch.maxTotal)
      return { kind: 'resourceBatchExchange', available, receiveResources: [...BUILDING_RESOURCES], minTotal: 'requireAtLeastOne' in batch && batch.requireAtLeastOne === true ? 1 : 0, maxTotal: batch.maxTotal }
    }
    const direct = readDirectTrade(actionContext)
    if (direct) return isTradeAllowed(direct, state, actionContext)
      ? { kind: 'resourceExchange', resourcesPaid: direct.from, resourcesGained: direct.to }
      : { kind: 'exchangeCatalog', choices: [] }
    const rawIds = actionContext?.tradeIds
    const ids = Array.isArray(rawIds) && rawIds.every((id): id is string => typeof id === 'string') ? rawIds : undefined
    const { options, trades } = buildExchangeOptions(player, ids, state, readMaxTradeTimesBySourceId(actionContext), actionContext, actionHooks)
    return { kind: 'exchangeCatalog', choices: options.flatMap(option => {
      const match = /^trade:(\d+):(\d+)$/.exec(option.value)
      const trade = match ? trades[Number(match[1])] : undefined
      return trade && match ? [{ sourceCard: trade.sourceId ?? trade.source, resourcesPaid: trade.from, resourcesGained: trade.to, minTimes: 1, maxTimes: Number(match[2]) }] : []
    }) }
  },
  anytime: true,
  allowAnytimeReentry: true,
  canBeExecutedByPlayer: (state, player, ctx) => {
    const submitted = ctx?.actionContext?.submittedExchangeBatch
    if (submitted) return validateExchangeBatch({ state, player, entries: submitted })
    const batch = ctx?.actionContext?.batchExchange as { maxTotal?: number } | undefined
    if (batch) {
      return BUILDING_RESOURCES.some((resource) => (player.resources[resource] ?? 0) > 0)
    }
    const directTrade = readDirectTrade(ctx?.actionContext)
    if (directTrade) return isTradeAllowed(directTrade, state, ctx?.actionContext) && canAffordTrade(player, directTrade, 1, state)
    const tradeIds = (ctx?.actionContext as { tradeIds?: string[] } | undefined)?.tradeIds
    const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(ctx?.actionContext)
    return buildExchangeOptions(player, tradeIds, state, maxTradeTimesBySourceId, ctx?.actionContext, ctx?.actionHooks)
      .options.some((option) => option.value !== 'cancel')
  },
  execute: ({ state, player, actionContext, eventSink, actionHooks }) => {
    if (actionContext?.submittedExchangeBatch) {
      return executeExchangeBatch({
        state, player, entries: actionContext.submittedExchangeBatch,
        actionHooks, eventSink, harvestFeed: actionContext.harvestFeed,
        reorganizeAnimals: actionContext.anytimeInteractionKind !== 'animal-reorg',
      })
    }
    const batch = actionContext?.batchExchange as
      | { cardId: string; maxTotal: number; promptKey?: PromptKey; requireAtLeastOne?: boolean }
      | undefined
    if (batch) {
      const discardAvailableByResource = batchExchangeAvailability(player, batch.maxTotal)
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
      if (!isTradeAllowed(directTrade, state, actionContext) || !canAffordTrade(player, directTrade, 1, state)) {
        return { type: 'fail', errorKey: 'log.actionNoExchange' }
      }
      const animalPaymentPreference = readAnimalPaymentPreference(actionContext)
      return executeExchangeBatch({
        state, player, entries: [{ trade: directTrade, count: 1 }],
        animalPaymentPreference, eventSink, actionHooks,
        reorganizeAnimals: actionContext?.anytimeInteractionKind !== 'animal-reorg',
      })
    }
    const filterIds = actionContext?.tradeIds as string[] | undefined
    const maxTradeTimesBySourceId = readMaxTradeTimesBySourceId(actionContext)
    const { options: allOptions } = buildExchangeOptions(player, filterIds, state, maxTradeTimesBySourceId, actionContext, actionHooks)
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
      request: { kind: 'choice' as const, options: filtered, structuredChoicePrefixes: ['bulk:'], anytimeWindow: { allowed: true as const, blockedIds: ['exchange'] } },
      promptKey: 'ui.interactionExchangeChoice',
    }
  },
  resolveChoice: ({ state, player, actionContext, eventSink, actionHooks }, choice, payload) => {
    const batch = actionContext?.batchExchange as
      | { cardId: string; maxTotal: number; requireAtLeastOne?: boolean }
      | undefined
    const batchPayload = payload?.resourceBatchExchange as ResourceBatchExchangePayload | undefined
    if (batch && batchPayload) {
      return resolveBatchExchange(state, player, batch, batchPayload, eventSink, actionHooks)
    }
    return resolveExchangeChoice(state, player, choice, actionContext, eventSink, actionHooks)
  },
}
