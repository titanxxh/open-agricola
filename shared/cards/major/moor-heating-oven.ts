import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'Major_Moor_HeatingOven'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { fuel: 2 }),
  },
} satisfies CardImpl

export const Major_Moor_HeatingOven = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Furnace',
    deck: 'major',
    number: 109,
    cost: { clay: 1, stone: 1 },
    vp: 1,
    extraVp: false,
    ovenIdentity: true,
    requiresFarmersOfTheMoor: true,
    heatingRoomDiscount: 1,
    desc: [
      'Immediately gain 2 fuel.',
      'When heating, heat 1 fewer room than you have.',
    ],
  } satisfies CardSourceMetaInput,
  impl: cardImpl,
})
