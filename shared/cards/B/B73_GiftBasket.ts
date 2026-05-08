import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B73_GiftBasket'

export const B73_GiftBasket = new MinorImprovement({
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
})

export const B73_GiftBasket_impl = {
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
