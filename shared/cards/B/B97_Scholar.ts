import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B97_Scholar'

export const B97_Scholar = new Occupation({
  id: CARD_ID,
  name: 'Scholar',
  deck: 'B',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: ['Once you live in a stone house, at the start of each round, you can play an occupation for an occupation cost of 1 <FOOD>, or a minor improvement (by paying its cost).'],
  cost: {},
  players: '1+',
})

export const B97_Scholar_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: { food: 1 } },
        },
        {
          type: 'leaf',
          actionId: 'minor-improvement',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
