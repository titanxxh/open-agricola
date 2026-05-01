import type { ActionDefinition } from '../../game/types'
import { incCounter } from '../../cards/__stubs__/helpers'

export const bonusVpAction: ActionDefinition = {
  id: 'bonus-vp',
  nameKey: 'actions.bonus-vp.name',
  descriptionKey: 'actions.bonus-vp.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, actionContext }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    // Mirror special-effect's targetPlayerId routing: when the card listener
    // owner ≠ actor, accumulate the bonus VP on the owner's cardStates.
    const targetId = (actionContext as { targetPlayerId?: string } | undefined)?.targetPlayerId
    const target = (typeof targetId === 'string' && targetId
      ? state.players.find((p) => p.id === targetId)
      : undefined) ?? player
    incCounter(target, sourceCard, 'bonusVp')
    return {
      type: 'ok',
      logKey: 'log.cardEffectBonusVp',
      logParams: { cardId: sourceCard },
    }
  },
}
