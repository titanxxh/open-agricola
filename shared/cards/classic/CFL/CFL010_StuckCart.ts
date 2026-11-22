import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { hasLegalPlaceFarmerTargets } from '../../../actions/effects/place-farmer'
import { peopleLeftToPlace } from '../../../actions/guest-turns'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { dispatchableGuests } from '../../../domain/guests'
import { getRoundPersonPlacementOrder } from '../../helpers/round-placement'

const CARD_ID = 'CFL010_StuckCart'
const PLACE_IF_AVAILABLE = 'card_CFL010_StuckCart_place-if-available'

registerAdHocAction({
  id: PLACE_IF_AVAILABLE,
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, actionHooks }) => {
    const actionContext = { trueAction: false }
    // A previous placement can use the last space a remaining person could enter.
    const hasTarget = hasLegalPlaceFarmerTargets(state, player, actionHooks, CARD_ID, actionContext)
      || dispatchableGuests(state, player).some((guest) =>
        hasLegalPlaceFarmerTargets(state, player, actionHooks, CARD_ID, {
          ...actionContext, workerSource: { kind: 'guest', guestId: guest.id },
        }),
      )
    if (!hasTarget) return { type: 'ok' }
    return {
      type: 'flow',
      flow: { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID, actionContext },
    }
  },
})

const cardImpl = {
  prerequisiteCheck: (player) => getRoundPersonPlacementOrder(player).length >= 2,
  effect: {
    id: CARD_ID,
    onBuy: (state, player, _payment, context) => ({
      type: 'seq',
      children: Array.from({ length: peopleLeftToPlace(state, player, context?.actionHooks) }, () => ({
        type: 'leaf',
        actionId: PLACE_IF_AVAILABLE,
        sourceCard: CARD_ID,
      })),
    }),
  },
} satisfies CardImpl

export const CFL010_StuckCart = defineMinorCard({
  meta: {
    id: 'CFL010_StuckCart',
    name: 'Stuck Cart',
    deck: 'CFL',
    number: 10,
    cost: {
      wood: 1,
    },
    vp: 1,
    passing: true,
    desc: [
      'Immediately place all your remaining family members, one after another. Then pass this card to the player on your left.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL010.png',
    prerequisite: '2 placed family members',
  },
  impl: cardImpl,
})
