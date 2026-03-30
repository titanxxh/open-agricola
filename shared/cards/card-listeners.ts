import type { ActionExecutionContext, ActionExecutionResult, GameState, PlayerState } from '../game/types'
import type { ActionHookPhase, ActionHookResult } from '../actions/hooks'

export type CardListenerContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
  canUseOccupied?: boolean
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
  order?: number
  scope?: CardListenerScope
  handler: (context: CardListenerContext) => ActionHookResult | void
}

const cardListeners: CardListenerRegistration[] = []

export const registerCardListener = (registration: CardListenerRegistration) => {
  cardListeners.push(registration)
}

export const clearCardListeners = () => {
  cardListeners.length = 0
}

export const getRegisteredCardListeners = () => [...cardListeners]

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

const getOrderedListeners = (context: CardListenerContext) =>
  cardListeners
    .filter((registration) => matchesListener(registration, context))
    .sort((left, right) => {
      const leftOrder = left.order ?? 0
      const rightOrder = right.order ?? 0
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      return left.id.localeCompare(right.id)
    })

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
): ActionHookResult | void => {
  return registration.handler(
    buildCardListenerContext(registration, context, options?.ownerPlayerId),
  )
}

const AUTO_LOGGED_CARD_EFFECT_ACTIONS = new Map<string, Set<string>>([
  ['log.cardEffectGain', new Set(['gain', 'take-from-card'])],
  ['log.cardEffectBonusVp', new Set(['bonus-vp'])],
  ['log.cardEffectPay', new Set(['pay-resources'])],
  ['log.cardEffectOtherPlayersGain', new Set(['gain-other-players'])],
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
  return cardListeners.find((l) => l.id === listenerId)
}
