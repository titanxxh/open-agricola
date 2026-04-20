import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D97_BeggingStudent'

export const D97_BeggingStudent = new Occupation({
  id: CARD_ID,
  name: 'Begging Student',
  deck: 'D',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you must immediately take 1 <BEGGING> marker. At the start of each harvest, you can play 1 occupation without paying an occupation cost.',
  ],
  cost: {},
  players: '1+',
})

export const D97_BeggingStudent_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    player.resources.begging += 1
  },
  onStartHarvest: (_state, player) => {
    if (player.occupationHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: {} },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
