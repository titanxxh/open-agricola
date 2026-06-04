import type { TradeModifier } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { defineMinorCard } from '../card-source'

const CARD_ID = 'E60_WorkingGloves'
const GROUP_ID = `${CARD_ID}:occupation-food-replacement`
const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const modifiers: TradeModifier[] = buildingResources.map((res) => ({
  type: 'trade',
  cardId: CARD_ID,
  appliesTo: ['occupation'],
  from: { [res]: 1 },
  to: { food: 2 },
  max: 1,
  groupId: GROUP_ID,
  groupMax: 1,
}))

export const E60_WorkingGloves = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Working Gloves',
    deck: 'E',
    number: 60,
    category: 'FOOD_-_CONVERT',
    desc: [
      'When you play this card, you get 1 <FOOD>. Each time you pay an occupation cost, you can pay 1 building resource of your choice in place of (up to) 2 <FOOD>.',
    ],
    cost: {},
  },
  impl: {
    effect: {
      id: CARD_ID,
      onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
    },
    modifiers,
    reaches: [] as readonly string[],
  },
})
