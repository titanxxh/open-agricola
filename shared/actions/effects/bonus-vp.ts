import type { ActionDefinition } from '../../contract/types'
import { incCounter } from '../../cards/helpers/card-state'
import { findPlayerById } from '../../domain/player'

/**
 * Points one `bonus-vp` leaf awards: `params.amount`, default 1. Anything but a
 * positive safe integer is invalid (undefined) and the leaf fails closed.
 */
export const bonusVpAmount = (params: Record<string, unknown> | undefined): number | undefined => {
  const amount = params?.amount ?? 1
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 1 ? amount : undefined
}

export const bonusVpAction: ActionDefinition = {
  id: 'bonus-vp',
  nameKey: 'actions.bonus-vp.name',
  descriptionKey: 'actions.bonus-vp.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, params, actionContext, eventSink }) => {
    const amount = bonusVpAmount(params)
    if (!sourceCard || amount === undefined) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }
    // Mirror special-effect's targetPlayerId routing: when the card listener
    // owner ≠ actor, accumulate the bonus VP on the owner's cardStates.
    const targetId = (actionContext as { targetPlayerId?: string } | undefined)?.targetPlayerId
    const target = findPlayerById(state, targetId) ?? player
    incCounter(target, sourceCard, 'bonusVp', amount)
    eventSink?.emit<'card.stateChanged'>({
      type: 'card.stateChanged',
      cardId: sourceCard,
      key: 'bonusVp',
      targetPlayerId: target.id,
    })
    return { type: 'ok' }
  },
}
