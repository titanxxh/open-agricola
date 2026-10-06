import type { ActionDefinition } from '../../contract/types'
import { incCounter } from '../../cards/__stubs__/helpers'
import { findPlayerById } from '../../domain/player'

export const bonusVpAction: ActionDefinition = {
  id: 'bonus-vp',
  nameKey: 'actions.bonus-vp.name',
  descriptionKey: 'actions.bonus-vp.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, actionContext, eventSink }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }
    // Mirror special-effect's targetPlayerId routing: when the card listener
    // owner ≠ actor, accumulate the bonus VP on the owner's cardStates.
    const targetId = (actionContext as { targetPlayerId?: string } | undefined)?.targetPlayerId
    const target = findPlayerById(state, targetId) ?? player
    incCounter(target, sourceCard, 'bonusVp')
    eventSink?.emit<'card.stateChanged'>({
      type: 'card.stateChanged',
      cardId: sourceCard,
      key: 'bonusVp',
      targetPlayerId: target.id,
    })
    return { type: 'ok' }
  },
}
