import type { ActionExecutionContext, ActionExecutionResult } from '../../game/types'
import type { ActionHookPhase, ActionHookResult } from '../hooks'
import type { GameState, PlayerState } from '../../game/types'

export type CardListenerContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
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
  ...player.improvements,
  ...player.minorPlayed,
  ...player.occupationPlayed,
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
    return state.players.some(
      (entry) =>
        entry.id !== player.id && playerHasAnyCard(entry, cardIds),
    )
  }
  return state.players.some((entry) => playerHasAnyCard(entry, cardIds))
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
        for (const p of context.state.players) {
          if (p.id !== context.player.id && getPlayerCardIds(p).includes(cardId)) {
            matched.push({ registration, cardId, ownerPlayerId: p.id })
          }
        }
      } else {
        for (const p of context.state.players) {
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
): ActionHookResult | void => {
  return registration.handler(context)
}

export const getListenerById = (listenerId: string): CardListenerRegistration | undefined => {
  return cardListeners.find((l) => l.id === listenerId)
}
