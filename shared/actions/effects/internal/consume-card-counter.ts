import type { ActionDefinition } from '../../../contract/types'
import { incCounter } from '../../../cards/helpers/card-state'

export const consumeCardCounterAction: ActionDefinition = {
  id: 'consume-card-counter', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: ({ sourceCard, params }) => sourceCard && typeof params?.counter === 'string' && typeof params.amount === 'number'
    ? { kind: 'cardCounter', cardId: sourceCard, counter: params.counter, amount: -params.amount } : undefined,
  execute: ({ player, sourceCard, params, eventSink }) => {
    if (!sourceCard || typeof params?.counter !== 'string' || typeof params.amount !== 'number' || !Number.isSafeInteger(params.amount) || params.amount <= 0 ||
        (player.cardStates?.[sourceCard]?.counters?.[params.counter] ?? 0) < params.amount) return { type: 'fail', errorKey: 'log.actionFail' }
    incCounter(player, sourceCard, params.counter, -params.amount)
    eventSink.emit<'card.stateChanged'>({ type: 'card.stateChanged', sourceCardId: sourceCard, cardId: sourceCard, targetPlayerId: player.id, key: params.counter })
    return { type: 'ok' }
  },
}
