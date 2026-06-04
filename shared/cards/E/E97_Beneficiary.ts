import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E97_Beneficiary'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      // Only triggers when this is the 3rd occupation played (including this card)
      if (player.occupationPlayed.length !== 3) return

      return {
        type: 'or' as const,
        optional: true,
        children: [
          {
            type: 'seq' as const,
            choiceLabelKey: 'actions.lessons.name',
            children: [
              {
                type: 'leaf' as const,
                actionId: 'occupation-gate',
                sourceCard: CARD_ID,
                actionContext: { occupationParams: { exactCost: { food: 1 } } },
              },
              {
                type: 'leaf' as const,
                actionId: 'occupation',
                sourceCard: CARD_ID,
                params: { exactCost: { food: 1 } },
              },
            ],
          },
          {
            type: 'leaf' as const,
            actionId: 'improvement',
            sourceCard: CARD_ID,
            actionContext: { types: ['minor'], trueAction: false },
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E97_Beneficiary = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Beneficiary',
    deck: 'E',
    number: 97,
    category: 'ACTION_-_OCCUPATION',
    desc: ['If this is your 3rd occupation, you can immediately play another occupation for an occupation cost of 1 <FOOD> and/or play 1 minor improvement by paying its cost.'],
    players: '1+',
  },
  impl: cardImpl,
})

export const E97_Beneficiary_impl = E97_Beneficiary.impl
