import type { ActionExecutionContext, ActionExecutionResult, ActionFlow, ActionSpace, Bonus, CardCostCandidate, CardProvidedPaymentResourceProvider, GameState, PlayerState, Resource, Trade } from '../contract/types'
import { runActionHooks, type ActionHookContext, type ActionHookPhase, type ActionHookResult } from '../actions/hooks'
import { getCurrentSessionContext } from './session-card-context'
import { getActiveCardRegistry } from './active-registry'
import { exchangeToTrade } from '../actions/effects/exchange-to-trade'
import type { DraftGameEvent, GameEvent } from '../contract/events'
import { createEventQuery, type EventQuery } from '../events/query'
import type { TriggerSnapshot } from './helpers/trigger-snapshot'

export type CardListenerContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  transactionEvents: readonly (GameEvent | DraftGameEvent)[]
  actionEvents?: readonly (GameEvent | DraftGameEvent)[]
  eventQuery: EventQuery
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
  extraData?: Record<string, unknown>
  cardId?: string
  actionCardId?: string
  pendingSourceCard?: string
  triggerPlayer?: PlayerState
  ownerPlayer?: PlayerState
  ownerCardId?: string
  ownerCardZone?: CardListenerZone
  effectPlayer?: PlayerState
  trueAction?: boolean
  triggerSnapshot?: TriggerSnapshot
}

export type CardListenerContextInput =
  Omit<CardListenerContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'> &
  Partial<Pick<CardListenerContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'>>

export type CardListenerScope = 'player' | 'opponent' | 'any'
export type CardListenerDispatchMode = 'serial' | 'select'
export type CardListenerZone = 'played' | 'hand'

export type CardListenerRegistration = {
  id: string
  cardIds?: string[]
  actions?: string[]
  phases?: ActionHookPhase[]
  scope?: CardListenerScope
  zones?: CardListenerZone[]
  mandatory?: boolean
  /**
   * Static dispatch grouping for trailing listener nodes.
   *
   * Default `serial` listeners are activated in play order without probing the
   * handler. `select` listeners for the same owner/phase/action are wrapped in
   * a trigger-select ParallelNode when two or more match.
   */
  dispatchMode?: CardListenerDispatchMode
  /**
   * Card-purchase cost candidate transform (Candidate Closure, ADR 0004).
   * Receives one Cost Candidate and returns the derived candidate(s), or
   * null when not applicable. The closure engine handles traversal, dedupe
   * and per-card use limits — declaration order never matters.
   */
  deriveCardCostCandidate?: (
    context: CardListenerContext,
    candidate: CardCostCandidate,
  ) => CardCostCandidate | readonly CardCostCandidate[] | null
  /**
   * Mandatory Saturation flag for `deriveCardCostCandidate` (BGA "costs
   * less" semantics): candidates this transform still applies to are not
   * shown to the player; only saturated candidates surface.
   */
  cardCostCandidateMandatory?: boolean
  handler?: (context: CardListenerContext) => ActionHookResult | void
}

export const getRegisteredCardListeners = (): CardListenerRegistration[] => {
  const active = getActiveCardRegistry()
  return active ? active.getAllListeners() : []
}

const DEFAULT_LISTENER_ZONES: readonly CardListenerZone[] = ['played']

const listenerZones = (registration: CardListenerRegistration): readonly CardListenerZone[] =>
  registration.zones?.length ? registration.zones : DEFAULT_LISTENER_ZONES

const getPlayerCardRefs = (
  player: PlayerState,
  zones: readonly CardListenerZone[],
): Array<{ cardId: string; zone: CardListenerZone }> => {
  const refs: Array<{ cardId: string; zone: CardListenerZone }> = []
  if (zones.includes('played')) {
    refs.push(...(player.improvements ?? []).map((cardId) => ({ cardId, zone: 'played' as const })))
    refs.push(...(player.minorPlayed ?? []).map((cardId) => ({ cardId, zone: 'played' as const })))
    refs.push(...(player.occupationPlayed ?? []).map((cardId) => ({ cardId, zone: 'played' as const })))
  }
  if (zones.includes('hand')) {
    refs.push(...(player.minorHand ?? []).map((cardId) => ({ cardId, zone: 'hand' as const })))
    refs.push(...(player.occupationHand ?? []).map((cardId) => ({ cardId, zone: 'hand' as const })))
  }
  return refs
}

const findPlayerCardRef = (
  player: PlayerState,
  cardId: string,
  zones: readonly CardListenerZone[],
) => getPlayerCardRefs(player, zones).find((ref) => ref.cardId === cardId)

const matchesListenerAction = (
  registration: CardListenerRegistration,
  contextActionId: string,
): boolean => {
  const actions = registration.actions
  if (!actions) return true
  return actions.includes(contextActionId)
}

const matchesListener = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
) => {
  if (registration.actions && !matchesListenerAction(registration, context.actionId)) {
    return false
  }
  if (registration.phases && !registration.phases.includes(context.phase)) {
    return false
  }
  return true
}

const getBaseListeners = (): CardListenerRegistration[] => {
  const active = getActiveCardRegistry()
  return active ? active.getAllListeners() : []
}

const getAllListeners = (): CardListenerRegistration[] => {
  const base = getBaseListeners()
  const sessionCtx = getCurrentSessionContext()
  if (!sessionCtx || sessionCtx.customListeners.length === 0) return base
  return [...base, ...sessionCtx.customListeners]
}

const getOrderedListeners = (
  context: CardListenerContext,
  listeners?: readonly CardListenerRegistration[],
) =>
  (listeners ? [...listeners] : getAllListeners())
    .filter((registration) => matchesListener(registration, context))
    .sort((left, right) => left.id.localeCompare(right.id))

const normalizeCardListenerContext = (
  context: CardListenerContextInput,
): CardListenerContext => {
  const transactionEvents = context.transactionEvents ?? []
  return {
    ...context,
    transactionEvents,
    eventQuery: context.eventQuery ?? createEventQuery(transactionEvents),
  }
}

type RunCardListenersOptions = {
  stampFlowOwner?: boolean
}

const stampFlowOwner = (flow: ActionFlow, ownerPlayerId: string): ActionFlow =>
  flow.targetPlayerId ? flow : { ...flow, targetPlayerId: ownerPlayerId }

export const runCardListeners = (
  context: CardListenerContextInput,
  listeners?: readonly CardListenerRegistration[],
  options: RunCardListenersOptions = {},
) => {
  const results: ActionHookResult[] = []
  getMatchingListeners(context, listeners).forEach((entry) => {
    const result = executeCardListener(entry.registration, context, listenerOwnerOptions(entry))
    if (result) {
      const flow = result.flow && options.stampFlowOwner && entry.ownerPlayerId
        ? stampFlowOwner(result.flow, entry.ownerPlayerId)
        : result.flow
      results.push(flow === result.flow ? result : { ...result, flow })
    }
  })
  return results
}

export type MatchedCardListener =
  | {
      registration: CardListenerRegistration
      cardId: ''
      ownerPlayerId: ''
      ownerCardZone?: undefined
    }
  | {
      registration: CardListenerRegistration
      cardId: string
      ownerPlayerId: string
      ownerCardZone: CardListenerZone
    }

export type CardListenerOwnerOptions = {
  ownerPlayerId?: string
  ownerCardId?: string
  ownerCardZone?: CardListenerZone
}

export const listenerOwnerOptions = (
  entry: MatchedCardListener,
): CardListenerOwnerOptions => ({
  ownerPlayerId: entry.ownerPlayerId || undefined,
  ownerCardId: entry.cardId || undefined,
  ownerCardZone: entry.ownerCardZone,
})

const findPlayerById = (state: GameState, playerId?: string) =>
  (state.players ?? []).find((player) => player.id === playerId)

const resolveOwnerPlayer = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
  owner?: CardListenerOwnerOptions,
) => {
  if (context.ownerPlayer) return context.ownerPlayer
  const ownerPlayerId = owner?.ownerPlayerId
  if (ownerPlayerId) {
    const byId = findPlayerById(context.state, ownerPlayerId)
    if (byId) return byId
  }
  const scope = registration.scope ?? 'player'
  if (scope === 'player') return context.player
  if (!registration.cardIds?.length) return context.player
  if (scope === 'opponent') {
    const zones = listenerZones(registration)
    return (context.state.players ?? []).find(
      (player) =>
        player.id !== context.player.id &&
        registration.cardIds!.some((cardId) => findPlayerCardRef(player, cardId, zones)),
    ) ?? context.player
  }
  const zones = listenerZones(registration)
  return (context.state.players ?? []).find((player) =>
    registration.cardIds!.some((cardId) => findPlayerCardRef(player, cardId, zones)),
  ) ?? context.player
}

export const buildCardListenerContext = (
  registration: CardListenerRegistration,
  context: CardListenerContextInput,
  owner?: string | CardListenerOwnerOptions,
): CardListenerContext => {
  const baseContext = normalizeCardListenerContext(context)
  const ownerOptions =
    typeof owner === 'string' ? { ownerPlayerId: owner } : owner
  const triggerPlayer = baseContext.triggerPlayer ?? baseContext.player
  const ownerPlayer = resolveOwnerPlayer(registration, baseContext, ownerOptions)
  const effectPlayer = baseContext.effectPlayer ?? ownerPlayer ?? triggerPlayer
  const trueAction =
    typeof baseContext.trueAction === 'boolean'
      ? baseContext.trueAction
      : baseContext.actionContext?.trueAction !== false
  return {
    ...baseContext,
    triggerPlayer,
    ownerPlayer,
    ownerCardId: ownerOptions?.ownerCardId ?? baseContext.ownerCardId,
    ownerCardZone: ownerOptions?.ownerCardZone ?? baseContext.ownerCardZone,
    effectPlayer,
    trueAction,
  }
}

export const getMatchingListeners = (
  context: CardListenerContextInput,
  listeners?: readonly CardListenerRegistration[],
): MatchedCardListener[] => {
  const listenerContext = normalizeCardListenerContext(context)
  const matched: MatchedCardListener[] = []
  getOrderedListeners(listenerContext, listeners).forEach((registration) => {
    if (!registration.cardIds || registration.cardIds.length === 0) {
      matched.push({ registration, cardId: '', ownerPlayerId: '' })
      return
    }
    const scope = registration.scope ?? 'player'
    const zones = listenerZones(registration)
    for (const cardId of registration.cardIds) {
      if (scope === 'player') {
        const ref = findPlayerCardRef(listenerContext.player, cardId, zones)
        if (ref) {
          matched.push({
            registration,
            cardId,
            ownerPlayerId: listenerContext.player.id,
            ownerCardZone: ref.zone,
          })
        }
      } else if (scope === 'opponent') {
        for (const p of listenerContext.state.players ?? []) {
          const ref = findPlayerCardRef(p, cardId, zones)
          if (p.id !== listenerContext.player.id && ref) {
            matched.push({ registration, cardId, ownerPlayerId: p.id, ownerCardZone: ref.zone })
          }
        }
      } else {
        for (const p of listenerContext.state.players ?? []) {
          const ref = findPlayerCardRef(p, cardId, zones)
          if (ref) {
            matched.push({ registration, cardId, ownerPlayerId: p.id, ownerCardZone: ref.zone })
            break
          }
        }
      }
    }
  })
  return matched
}

export const executeCardListener = (
  registration: CardListenerRegistration,
  context: CardListenerContextInput,
  options?: CardListenerOwnerOptions,
): ActionHookResult | undefined => {
  if (!registration.handler) return undefined
  return (
    registration.handler(
      buildCardListenerContext(registration, context, options),
    ) ?? undefined
  )
}

export const getListenerById = (listenerId: string): CardListenerRegistration | undefined => {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    const custom = sessionCtx.customListeners.find((l) => l.id === listenerId)
    if (custom) return custom
  }
  const active = getActiveCardRegistry()
  return active?.getAllListeners().find((l) => l.id === listenerId)
}

/**
 * Run `computeChoiceCandidates` phase listeners for a given action and merge
 * their `extraOptions`. This is a generic extension point for action handlers
 * that build their own choice list via `execute()` (i.e. without the
 * engine-managed `getBaseChoiceOptions` opt-in flow): the handler can call
 * this helper to let cards inject extra candidates.
 *
 * Used by minor-improvement.execute so cards like D131 CraftsmanshipPromoter
 * can inject bottom-row major candidates into the minor-improvement choice.
 */
export const collectComputeChoiceCandidates = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  actionContext?: Record<string, unknown>,
  sourceCard?: string,
): import('../contract/types').ActionChoiceOption[] => {
  const baseCtx: CardListenerContextInput = {
    state,
    player,
    space: makeDummySpace(actionId),
    actionId,
    phase: 'computeChoiceCandidates' as ActionHookPhase,
    actionContext,
    sourceCard,
  }
  const out: import('../contract/types').ActionChoiceOption[] = []
  for (const matched of getMatchingListeners(baseCtx)) {
    const result = executeCardListener(matched.registration, baseCtx, listenerOwnerOptions(matched))
    if (result?.extraOptions) {
      out.push(...result.extraOptions)
    }
  }
  return out
}

/**
 * Run `computeExchanges` phase listeners for a given exchange window and merge
 * their `extraExchanges`. Generic extension point sister to
 * `collectComputeChoiceCandidates`. Used by `getExchangesInWindow` so cards
 * like C62 CookeryExtension can inject runtime-derived trades that depend on
 * other played cards (e.g. C62 doubles food output of every isCookery card
 * during harvest, with a per-cookery shared used flag).
 *
 * Each returned `CardExchange` is converted to a `Trade` via `exchangeToTrade`,
 * with the listener's owning card id as fallback `sourceId`.
 */
export const collectComputeExchanges = (
  state: GameState,
  player: PlayerState,
  window: string,
): Trade[] => {
  const baseCtx: CardListenerContextInput = {
    state,
    player,
    space: makeDummySpace('compute-exchanges'),
    actionId: 'compute-exchanges',
    phase: 'computeExchanges' as ActionHookPhase,
    extraData: { window },
  }
  const out: Trade[] = []
  for (const matched of getMatchingListeners(baseCtx)) {
    const result = executeCardListener(matched.registration, baseCtx, listenerOwnerOptions(matched))
    if (!result?.extraExchanges) continue
    const ownerCardId = matched.registration.cardIds?.[0] ?? 'unknown'
    for (const ex of result.extraExchanges) {
      out.push(exchangeToTrade(ex, ownerCardId))
    }
  }
  return out
}

const makeDummySpace = (actionId: string): ActionSpace => ({
  id: `${actionId}-cost-preview`,
  position: 0,
  players: [],
  available: true,
} as unknown as ActionSpace)

/**
 * Run `computeCosts` phase listeners (action hooks + card listeners) for a
 * farm-choice commit pass. Used by the farm selection commit path to
 * obtain a cost override that includes farm-payload-aware listeners (e.g.
 * E16 BriarHedge sees `params.newFenceEdges`).
 *
 * Mirrors `HookDispatcher.computeCosts` but aggregates results into a
 * `Partial<Resource>` and accepts an optional `space` (defaults to a dummy
 * placeholder — listeners must not read `ctx.space`).
 */
export type FarmChoiceCostAdjustments = {
  costs: Partial<Resource>
  trades: Trade[]
  bonuses: Bonus[]
  paymentResourceProviders: CardProvidedPaymentResourceProvider[]
}

export const collectFarmChoiceCostAdjustments = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  params: Record<string, unknown>,
  space?: ActionSpace,
): FarmChoiceCostAdjustments => {
  const ctx: ActionHookContext = {
    state,
    player,
    space: space ?? makeDummySpace(actionId),
    params,
    actionId,
    phase: 'computeCosts',
    transactionEvents: [],
    eventQuery: createEventQuery([]),
  }
  const aggregated: FarmChoiceCostAdjustments = {
    costs: {},
    trades: [],
    bonuses: [],
    paymentResourceProviders: [],
  }
  const merge = (costs?: Partial<Resource>) => {
    if (!costs) return
    for (const [key, value] of Object.entries(costs)) {
      if (typeof value !== 'number') continue
      const k = key as keyof Resource
      aggregated.costs[k] = (aggregated.costs[k] ?? 0) + value
    }
  }
  const mergeResult = (result: ActionHookResult) => {
    merge(result.costs)
    if (result.trades) aggregated.trades.push(...result.trades)
    if (result.bonuses) aggregated.bonuses.push(...result.bonuses)
    if (result.paymentResourceProviders) {
      aggregated.paymentResourceProviders.push(...result.paymentResourceProviders)
    }
  }
  runActionHooks(ctx).forEach(mergeResult)
  for (const entry of getMatchingListeners(ctx)) {
    const result = executeCardListener(entry.registration, ctx, listenerOwnerOptions(entry))
    if (result) mergeResult(result)
  }
  return aggregated
}

export const collectComputeCostsForFarmChoice = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  params: Record<string, unknown>,
  space?: ActionSpace,
): Partial<Resource> =>
  collectFarmChoiceCostAdjustments(state, player, actionId, params, space).costs
