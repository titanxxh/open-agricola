import type { ActionDefinition } from '../../contract/types'
import { incCounter } from '../../cards/__stubs__/helpers'

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
    const target = (typeof targetId === 'string' && targetId
      ? state.players.find((p) => p.id === targetId)
      : undefined) ?? player
    incCounter(target, sourceCard, 'bonusVp')
    eventSink?.emit<'card.stateChanged'>({
      type: 'card.stateChanged',
      cardId: sourceCard,
      key: 'bonusVp',
      value: target.cardStates?.[sourceCard]?.counters?.bonusVp ?? 0,
      targetPlayerId: target.id,
    })
    return { type: 'ok' }
  },
}
