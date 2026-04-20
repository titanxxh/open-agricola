import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getExtraRoomCapacity } from '../card-effects'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'D21_Recruitment'

/**
 * D21 Recruitment (Minor Improvement, D, 21)
 * From round 5 on, provided you have room in your house, each time you get a
 * Minor Improvement action, you can take a Family Growth action instead.
 *
 * BGA:
 *  - onPlayerComputeReplaceImprovement: returns WISHCHILDREN with optional flag,
 *    when event types contains MINOR and trueAction and round >= 5.
 *  - checkArgs: MINOR in args['types'] && trueAction && Globals::getTurn() >= 5
 *  - onPlayerIsDoable: allow the IMPROVEMENT action when checkArgs true (so the
 *    player can still choose to take the action and trigger the replace path).
 *
 * Implementation:
 *  - computeReplace listener on both 'minor-improvement' and 'improvement-any'
 *    (our engine's equivalents of MINOR / IMPROVEMENT entry points).
 *  - Returns decline=true with an alternativeFlow that triggers
 *    'wish-children-growth' (the standard family-growth action) as optional.
 *  - Only fires when round >= 5 AND player has room in the house
 *    (rooms + extraRoomCapacity > familySize).
 *  - isDoable listener: keeps the action available even when the player has
 *    no affordable improvements, because the replace path can still be taken.
 */

const effectiveRooms = (player: CardListenerContext['player']) =>
  player.rooms + getExtraRoomCapacity(player)

const hasHouseRoom = (player: CardListenerContext['player']) =>
  effectiveRooms(player) > familySize(player)

const shouldOfferReplace = (context: CardListenerContext) => {
  if (context.state.round < 5) return false
  if (!hasHouseRoom(context.player)) return false
  if (context.actionContext?.trueAction === false) return false
  return true
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'D21-recruitment-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['minor-improvement', 'improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!shouldOfferReplace(context)) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'wish-children-growth',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D21-recruitment-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['minor-improvement', 'improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round < 5) return
    if (!hasHouseRoom(context.player)) return
    if (context.actionContext?.trueAction === false) return
    return { doable: true }
  },
}

export const D21_Recruitment = new MinorImprovement({
  id: CARD_ID,
  name: 'Recruitment',
  deck: 'D',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['From round 5 on, provided you have room in your house, each time you get a __Minor Improvement__ action, you can take a __Family Growth__ action instead.'],
  cost: { food: 1 },
  prerequisite: 'No People Left in the House',
})

export const D21_Recruitment_impl = {
  listeners: [computeReplaceListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
