import type { ActionDefinition, OrdinaryCardType, PlayerState } from '../../../contract/types'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'

const handFor = (player: PlayerState, cardType: OrdinaryCardType): string[] =>
  cardType === 'occupation' ? player.occupationHand : player.minorHand

const readCardType = (params?: Record<string, unknown>): OrdinaryCardType | null => {
  const value = params?.cardType
  return value === 'minor' || value === 'occupation' ? value : null
}

const readCount = (params?: Record<string, unknown>): number | null => {
  const value = params?.count
  return Number.isInteger(value) && typeof value === 'number' && value > 0 ? value : null
}

export const drawOrdinaryCardsAction: ActionDefinition = {
  id: 'draw-ordinary-cards',
  nameKey: 'actions.draw-ordinary-cards.name',
  descriptionKey: 'actions.draw-ordinary-cards.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, _player, context) => {
    const cardType = readCardType(context?.actionContext)
    const count = readCount(context?.actionContext)
    return cardType !== null && count !== null && state.ordinaryCardDecks[cardType].length > 0
  },
  execute: ({
    state,
    player,
    params,
    sourceCard,
    actionContext,
    emitPrivateEvent,
    reportProtectedObservation,
  }) => {
    const mergedParams = { ...(actionContext ?? {}), ...(params ?? {}) }
    const cardType = readCardType(mergedParams)
    const count = readCount(mergedParams)
    if (cardType === null || count === null) return { type: 'fail', errorKey: 'log.actionUnavailable' }

    const deck = state.ordinaryCardDecks[cardType]
    const drawn = deck.splice(0, Math.min(count, deck.length))
    if (drawn.length === 0) return { type: 'ok' }
    reportProtectedObservation?.({
      kind: 'hidden-information',
      recipientPlayerIds: [player.id],
    })

    const hand = handFor(player, cardType)
    hand.push(...drawn)
    if (sourceCard) {
      emitPrivateEvent?.(cardEffectHandChangedEvent(
        player.id,
        [...hand],
        cardType,
        sourceCard,
        typeof mergedParams.sourceActionId === 'string' ? mergedParams.sourceActionId : undefined,
      ))
    }
    return { type: 'ok', extraData: { drawnCards: drawn, cardType } }
  },
}
