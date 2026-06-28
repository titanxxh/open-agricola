import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B073_GiftBasket'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const roomMap: Record<number, Partial<Resource>> = {
      2: { vegetable: 1 },
      3: { food: 1 },
      4: { grain: 1 },
      5: { vegetable: 1 },
    }
    const gain = roomMap[player.rooms]
    if (!gain) return
    return gainLeaf(CARD_ID, gain)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B073_GiftBasket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Gift Basket',
    deck: 'B',
    number: 73,
    category: 'CROP_PROVIDER',
    desc: ['When you play this card, if you have exactly 2/3/4/5 rooms, you immediately get 1 <VEGETABLE>/<FOOD>/<GRAIN>/<VEGETABLE>.'],
    cost: { reed: 1 },
    vp: 1,
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const B073_GiftBasket_impl = B073_GiftBasket.impl
