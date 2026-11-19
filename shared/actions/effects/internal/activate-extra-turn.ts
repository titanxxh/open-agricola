import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { guestTurnFlow } from '../../../cards/helpers/guest-flow'
import { canDispatchGuest } from '../../guest-turns'

/** Expands the chosen extra-turn opportunity: a card's `contributeExtraTurn`, or a Guest's turn. */
export const activateExtraTurnAction: ActionDefinition = {
  id: 'activate-extra-turn',
  nameKey: 'actions.activate-extra-turn.name',
  descriptionKey: 'actions.activate-extra-turn.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    context?.params?.guestId === undefined || canDispatchGuest(state, player, context.params.guestId, context.actionHooks),
  execute: ({ state, player, params, actionHooks }) => {
    if (params?.guestId !== undefined) {
      const flow = guestTurnFlow(state, player, params.guestId)
      return flow ? { type: 'flow', flow } : { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    const cardId = params?.cardId
    if (typeof cardId !== 'string') {
      return { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    const flow = getCardEffect(cardId)?.contributeExtraTurn?.(state, player, { actionHooks })
    if (flow) return { type: 'flow', flow }
    return { type: 'fail', errorKey: 'log.cardEffectFail' }
  },
}
