import type { ActionDefinition } from '../../../contract/types'
import { getCardStack, popFromCardStack } from '../../../cards/helpers/card-state'
export const discardCardStackAction: ActionDefinition = {
  id: 'discard-card-stack', nameKey: 'actions.pop-card-stack.name', descriptionKey: 'actions.pop-card-stack.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: (_state, player, context) => Boolean(context?.sourceCard && getCardStack(player, context.sourceCard).length),
  previewEffect: ({ player, sourceCard }) => {
    const item = sourceCard ? getCardStack(player, sourceCard).at(-1) : undefined
    return sourceCard && item ? { kind: 'cardStack', cardId: sourceCard, item, amount: -1 } : undefined
  },
  execute: ({ player, sourceCard, eventSink }) => {
    if (!sourceCard || !getCardStack(player, sourceCard).length) return { type: 'fail', errorKey: 'log.actionFail' }
    const item = popFromCardStack(player, sourceCard)
    eventSink.emit<'card.stackChanged'>({ type: 'card.stackChanged', cardId: sourceCard, targetPlayerId: player.id, ...(item === 'food' ? { resources: { food: 1 } } : {}), delta: -1, reason: 'discard' })
    return { type: 'ok' }
  },
}
