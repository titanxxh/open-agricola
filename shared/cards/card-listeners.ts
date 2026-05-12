import type { ActionExecutionContext, ActionExecutionResult, ActionSpace, GameState, PlayerState, Resource, Trade } from '../contract/types'
import { runActionHooks, type ActionHookContext, type ActionHookPhase, type ActionHookResult } from '../actions/hooks'
import { getCurrentSessionContext } from './session-card-context'
import { getActiveCardRegistry } from './active-registry'
import { exchangeToTrade } from '../actions/effects/exchange'

export type CardListenerContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
  extraData?: Record<string, unknown>
  cardId?: string
  actionCardId?: string
  triggerPlayer?: PlayerState
  ownerPlayer?: PlayerState
  effectPlayer?: PlayerState
  trueAction?: boolean
}

export type CardListenerScope = 'player' | 'opponent' | 'any'

export type CardListenerRegistration = {
  id: string
  cardIds?: string[]
  actions?: string[]
  phases?: ActionHookPhase[]
  scope?: CardListenerScope
  mandatory?: boolean
  handler: (context: CardListenerContext) => ActionHookResult | void
}

export const getRegisteredCardListeners = (): CardListenerRegistration[] => {
  const active = getActiveCardRegistry()
  return active ? active.getAllListeners() : []
}

const getPlayerCardIds = (player: PlayerState) => [
  ...(player.improvements ?? []),
  ...(player.minorPlayed ?? []),
  ...(player.occupationPlayed ?? []),
]

const playerHasAnyCard = (player: PlayerState, cardIds: string[]) =>
  cardIds.some((id) => getPlayerCardIds(player).includes(id))

const scopeMatches = (
  state: GameState,
  player: PlayerState,
  registration: CardListenerRegistration,
) => {
  if (!registration.cardIds || registration.cardIds.length === 0) return true
  const cardIds = registration.cardIds
  const scope = registration.scope ?? 'player'
  if (scope === 'player') {
    return playerHasAnyCard(player, cardIds)
  }
  if (scope === 'opponent') {
    return (state.players ?? []).some(
      (entry) =>
        entry.id !== player.id && playerHasAnyCard(entry, cardIds),
    )
  }
  return (state.players ?? []).some((entry) => playerHasAnyCard(entry, cardIds))
}

const matchesListener = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
) => {
  if (registration.actions && !registration.actions.includes(context.actionId)) {
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

const getOrderedListeners = (context: CardListenerContext) =>
  getAllListeners()
    .filter((registration) => matchesListener(registration, context))
    .sort((left, right) => left.id.localeCompare(right.id))

export const runCardListeners = (context: CardListenerContext) => {
  const results: ActionHookResult[] = []
  getOrderedListeners(context).forEach((registration) => {
    if (!scopeMatches(context.state, context.player, registration)) {
      return
    }
    const result = registration.handler(context)
    if (result) {
      results.push(result)
    }
  })
  return results
}

export type MatchedCardListener = {
  registration: CardListenerRegistration
  cardId: string
  ownerPlayerId: string
}

const findPlayerById = (state: GameState, playerId?: string) =>
  (state.players ?? []).find((player) => player.id === playerId)

const resolveOwnerPlayer = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
  ownerPlayerId?: string,
) => {
  if (context.ownerPlayer) return context.ownerPlayer
  if (ownerPlayerId) {
    const byId = findPlayerById(context.state, ownerPlayerId)
    if (byId) return byId
  }
  const scope = registration.scope ?? 'player'
  if (scope === 'player') return context.player
  if (!registration.cardIds?.length) return context.player
  if (scope === 'opponent') {
    return (context.state.players ?? []).find(
      (player) =>
        player.id !== context.player.id &&
        registration.cardIds!.some((cardId) => getPlayerCardIds(player).includes(cardId)),
    ) ?? context.player
  }
  return (context.state.players ?? []).find((player) =>
    registration.cardIds!.some((cardId) => getPlayerCardIds(player).includes(cardId)),
  ) ?? context.player
}

export const buildCardListenerContext = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
  ownerPlayerId?: string,
): CardListenerContext => {
  const triggerPlayer = context.triggerPlayer ?? context.player
  const ownerPlayer = resolveOwnerPlayer(registration, context, ownerPlayerId)
  const effectPlayer = context.effectPlayer ?? ownerPlayer ?? triggerPlayer
  const trueAction =
    typeof context.trueAction === 'boolean'
      ? context.trueAction
      : context.actionContext?.trueAction !== false
  return {
    ...context,
    triggerPlayer,
    ownerPlayer,
    effectPlayer,
    trueAction,
  }
}

export const getMatchingListeners = (context: CardListenerContext): MatchedCardListener[] => {
  const matched: MatchedCardListener[] = []
  getOrderedListeners(context).forEach((registration) => {
    if (!registration.cardIds || registration.cardIds.length === 0) {
      matched.push({ registration, cardId: '', ownerPlayerId: '' })
      return
    }
    const scope = registration.scope ?? 'player'
    for (const cardId of registration.cardIds) {
      if (scope === 'player') {
        if (getPlayerCardIds(context.player).includes(cardId)) {
          matched.push({ registration, cardId, ownerPlayerId: context.player.id })
        }
      } else if (scope === 'opponent') {
        for (const p of context.state.players ?? []) {
          if (p.id !== context.player.id && getPlayerCardIds(p).includes(cardId)) {
            matched.push({ registration, cardId, ownerPlayerId: p.id })
          }
        }
      } else {
        for (const p of context.state.players ?? []) {
          if (getPlayerCardIds(p).includes(cardId)) {
            matched.push({ registration, cardId, ownerPlayerId: p.id })
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
  context: CardListenerContext,
  options?: { ownerPlayerId?: string },
): ActionHookResult | undefined => {
  return (
    registration.handler(
      buildCardListenerContext(registration, context, options?.ownerPlayerId),
    ) ?? undefined
  )
}

const AUTO_LOGGED_CARD_EFFECT_ACTIONS = new Map<string, Set<string>>([
  ['log.cardEffectGain', new Set(['gain', 'take-from-card'])],
  ['log.cardEffectBonusVp', new Set(['bonus-vp'])],
  ['log.cardEffectPay', new Set(['pay'])],
  ['log.cardEffectOtherPlayersGain', new Set(['gain'])],
])

export const shouldSkipImmediateListenerLog = (
  result: Pick<ActionHookResult, 'flow' | 'logKey'> | void,
): boolean => {
  if (!result?.logKey || !result.flow || result.flow.type !== 'leaf' || !result.flow.sourceCard) {
    return false
  }
  const actionIds = AUTO_LOGGED_CARD_EFFECT_ACTIONS.get(result.logKey)
  return actionIds?.has(result.flow.actionId) ?? false
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
): import('../contract/types').ActionChoiceOption[] => {
  const baseCtx: CardListenerContext = {
    state,
    player,
    actionId,
    phase: 'computeChoiceCandidates' as ActionHookPhase,
  } as CardListenerContext
  const out: import('../contract/types').ActionChoiceOption[] = []
  for (const matched of getMatchingListeners(baseCtx)) {
    const result = executeCardListener(matched.registration, baseCtx, {
      ownerPlayerId: matched.ownerPlayerId,
    })
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
  const baseCtx: CardListenerContext = {
    state,
    player,
    actionId: 'compute-exchanges',
    phase: 'computeExchanges' as ActionHookPhase,
    extraData: { window },
  } as unknown as CardListenerContext
  const out: Trade[] = []
  for (const matched of getMatchingListeners(baseCtx)) {
    const result = executeCardListener(matched.registration, baseCtx, {
      ownerPlayerId: matched.ownerPlayerId,
    })
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
 * farm-choice commit pass. Used by `commitFarmChoice` / `applyFarmChoice` to
 * obtain a cost override that includes farm-payload-aware listeners (e.g.
 * E16 BriarHedge sees `params.newFenceEdges`).
 *
 * Mirrors `HookDispatcher.computeCosts` but aggregates results into a
 * `Partial<Resource>` and accepts an optional `space` (defaults to a dummy
 * placeholder — listeners must not read `ctx.space`).
 */
export const collectComputeCostsForFarmChoice = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  params: Record<string, unknown>,
  space?: ActionSpace,
): Partial<Resource> => {
  const ctx: ActionHookContext = {
    state,
    player,
    space: space ?? makeDummySpace(actionId),
    params,
    actionId,
    phase: 'computeCosts',
  }
  const aggregated: Partial<Resource> = {}
  const merge = (costs?: Partial<Resource>) => {
    if (!costs) return
    for (const [key, value] of Object.entries(costs)) {
      if (typeof value !== 'number') continue
      const k = key as keyof Resource
      aggregated[k] = (aggregated[k] ?? 0) + value
    }
  }
  runActionHooks(ctx).forEach((r: ActionHookResult) => merge(r.costs))
  for (const entry of getMatchingListeners(ctx)) {
    const result = executeCardListener(entry.registration, ctx, {
      ownerPlayerId: entry.ownerPlayerId,
    })
    if (result) merge(result.costs)
  }
  return aggregated
}
