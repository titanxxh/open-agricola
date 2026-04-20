import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E97_Beneficiary'

export const E97_Beneficiary = new Occupation({
  id: CARD_ID,
  name: 'Beneficiary',
  deck: 'E',
  number: 97,
  category: 'ACTION_ENHANCER',
  desc: ['If this is your 3rd occupation, you can immediately play another occupation for an occupation cost of 1 <FOOD> and/or play 1 minor improvement by paying its cost.'],
  players: '1+',
})

export const E97_Beneficiary_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Only triggers when this is the 3rd occupation played (including this card)
    if (player.occupationPlayed.length !== 3) return

    return {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'seq' as const,
          children: [
            {
              type: 'leaf' as const,
              actionId: 'play-occupation',
              sourceCard: CARD_ID,
              params: { cost: { food: 1 } },
            },
          ],
        },
        {
          type: 'leaf' as const,
          actionId: 'minor-improvement',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
