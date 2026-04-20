import { Occupation } from '../types'
import { payGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C103_GreenGrocer'

export const C103_GreenGrocer = new Occupation({
  id: CARD_ID,
  name: 'Green Grocer',
  deck: 'C',
  number: 103,
  category: 'GOODS_PROVIDER',
  desc: ['At the start of each round, you can make exactly one of the following exchanges: 1 <CATTLE> <ARROW> 1 <VEGETABLE>; 1 <VEGETABLE> <ARROW> 1 <CATTLE>; 2 <SHEEP> <ARROW> 1 <VEGETABLE>; 1 <VEGETABLE> <ARROW> 2 <SHEEP>; 2 <FOOD> <ARROW> 1 <GRAIN>; 1 <GRAIN> <ARROW> 2 <FOOD>'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const C103_GreenGrocer_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {

    const options = [
      { cost: { cattle: 1 }, gain: { vegetable: 1 } },
      { cost: { vegetable: 1 }, gain: { cattle: 1 } },
      { cost: { sheep: 2 }, gain: { vegetable: 1 } },
      { cost: { vegetable: 1 }, gain: { sheep: 2 } },
      { cost: { food: 2 }, gain: { grain: 1 } },
      { cost: { grain: 1 }, gain: { food: 2 } },
    ].filter(({ cost }) =>
      Object.entries(cost).every(([k, v]) => (player.resources[k as keyof typeof player.resources] ?? 0) >= v),
    )

    if (options.length === 0) return

    const children = options.map(({ cost, gain }) =>
      payGainActionFlow({ cardId: CARD_ID, cost, gain }),
    )

    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
