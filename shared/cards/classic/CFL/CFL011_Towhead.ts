import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { appendImmediateEvents } from '../../../events/append'

const CARD_ID = 'CFL011_Towhead'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const index = state.roundActionOrder.indexOf('wish-children')
      if (index >= 0 && index !== 5)
        [state.roundActionOrder[index], state.roundActionOrder[5]] = [
          state.roundActionOrder[5]!,
          'wish-children',
        ]
    },
    onAfterRevealAction: (state, player) => {
      if (state.round !== 5) return
      const space = state.actionSpaces.find((item) => item.id === 'wish-children')
      if (!space) return
      space.exclusiveUse = { playerId: player.id, sourceCardId: CARD_ID, untilRound: 6 }
      appendImmediateEvents(
        state,
        [
          { type: 'action.revealed', actionId: space.id, roundSlot: 6 },
          {
            type: 'action.exclusiveUseSet',
            actionId: space.id,
            playerId: player.id,
            sourceCardId: CARD_ID,
            untilRound: 6,
          },
        ],
        { actorPlayerId: player.id, sourceCardId: CARD_ID },
      )
    },
  },
} satisfies CardImpl

export const CFL011_Towhead = defineMinorCard({
  meta: {
    id: 'CFL011_Towhead',
    name: 'Towhead',
    deck: 'CFL',
    number: 11,
    cost: {
      wood: 1,
    },
    vp: 0,
    desc: [
      'Put the Family Growth with room action card on round 6. In round 5, you alone may also use it before its normal reveal. Play this card no later than round 4.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL011.png',
    maxRound: 4,
  },
  impl: cardImpl,
})
