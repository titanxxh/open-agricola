import { Occupation } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B167_StableSergeant'

export const B167_StableSergeant = new Occupation({
  id: CARD_ID,
  name: 'Stable Sergeant',
  deck: 'B',
  number: 167,
  category: 'ANIMAL_HANDLER',
  desc: ['When you play this card, you can pay 2 <FOOD> to get 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>, but only if you can accommodate all three animals on your farm.'],
  cost: {},
  players: '4+',
})

export const B167_StableSergeant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    optional: true,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
      gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
