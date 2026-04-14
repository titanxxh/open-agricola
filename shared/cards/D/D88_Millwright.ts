import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { TradeModifier } from '../../game/types'

const CARD_ID = 'D88_Millwright'

/**
 * D88 Millwright — You immediately get 1 grain. Each time you build fences,
 * stables, and rooms, or renovate your house, you can replace up to 2 building
 * resources of any type with 1 grain each.
 *
 * BGA reference: onBuy gives grain. addMillwrightBonus adds 2 sets of
 * bonus choices (each wood/clay/stone/reed can be replaced with 1 grain).
 *
 * Modeled as trade modifiers: 1 grain replaces 1 of each building resource,
 * max 1 per trade, with 2 trades per type applied.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
})

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
