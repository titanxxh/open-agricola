import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E153_StoneSculptor'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player): number => {
      const earned = player.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned
      return typeof earned === 'number' ? earned : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E153_StoneSculptor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stone Sculptor',
    deck: 'E',
    number: 153,
    category: 'BONUS_POINTS',
    desc: ['Each harvest, you can use this card to exchange exactly 1 <STONE> for 1 bonus <SCORE> and 1 <FOOD>.'],
    cost: {},
    players: '4+',
    extraVp: true,
    waresSalesmanGains: [{ stone: 1, reed: 1 }],
    exchanges: [
        {
          from: { stone: 1 },
          to: { food: 1 },
          max: 1,
          triggers: ['harvest'],
          sourceId: CARD_ID,
          sideEffect: { type: 'bonusVp', amount: 1 },
        },
      ],
  },
  impl: cardImpl,
})

export const E153_StoneSculptor_impl = E153_StoneSculptor.impl
