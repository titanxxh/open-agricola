import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { TradeModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D88_Millwright'

const COST_TYPES = ['construct', 'renovation', 'fencing', 'stables'] as const

const buildTradeModifiers = (): TradeModifier[] => {
  const modifiers: TradeModifier[] = []
  for (const costType of COST_TYPES) {
    for (const resource of ['wood', 'clay', 'stone', 'reed'] as const) {
      // Two trades per resource type (up to 2 substitutions total)
      modifiers.push({
        type: 'trade',
        cardId: CARD_ID,
        appliesTo: [costType],
        from: { grain: 1 },
        to: { [resource]: 1 },
        max: 1,
      })
      modifiers.push({
        type: 'trade',
        cardId: CARD_ID,
        appliesTo: [costType],
        from: { grain: 1 },
        to: { [resource]: 1 },
        max: 1,
      })
    }
  }
  return modifiers
}

export const D88_Millwright = new Occupation({
  id: CARD_ID,
  name: 'Millwright',
  deck: 'D',
  number: 88,
  category: 'FARM_PLANNER',
  desc: [
    'You immediately get 1 <GRAIN>. Each time you build fences, stables, and rooms, or renovate your house, you can replace up to 2 building resources of any type with 1 <GRAIN> each.',
  ],
  cost: {},
  players: '1+',
  modifiers: buildTradeModifiers(),
})

export const D88_Millwright_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
