import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { addTemporaryGuest } from '../../../domain/supply-workers'

const CARD_ID = 'CFL026_SpeculoosBakery'

const GUEST_ACTION = 'card_CFL026_SpeculoosBakery_guest'
registerAdHocAction({
  id: GUEST_ACTION,
  nameKey: 'ui.interactionUseAbility',
  descriptionKey: 'ui.interactionUseAbility',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state) => state.roundPhase === 'work',
  execute: ({ state, player }) => {
    addTemporaryGuest(state, player, CARD_ID)
    return { type: 'ok' }
  },
})

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-bake',
      cardIds: [CARD_ID],
      actions: ['bake-bread'],
      phases: ['after'],
      handler: (context) => {
        if (
          context.actionContext?.trueAction === false ||
          !context.space ||
          context.state.roundPhase !== 'work'
        )
          return
        return {
          flow: payGainFlow({
            cardId: CARD_ID,
            cost: { grain: 1 },
            followUp: [{ type: 'leaf', actionId: GUEST_ACTION, sourceCard: CARD_ID }],
          }),
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL026_SpeculoosBakery = defineMinorCard({
  meta: {
    id: 'CFL026_SpeculoosBakery',
    name: 'Speculoos Bakery',
    deck: 'CFL',
    number: 26,
    cost: {
      wood: 2,
      clay: 2,
    },
    vp: 1,
    desc: [
      'Whenever you Bake Bread using an action space, you may pay 1 <GRAIN> to get a guest for the rest of this round.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL026.png',
  },
  impl: cardImpl,
})
