import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'

const CARD_ID = 'B105_CaseBuilder'

// BGA: for each of food/grain/vegetable/reed/wood, gain 1 if player has ≥2 in supply.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const resources: (keyof Resource)[] = ['food', 'grain', 'vegetable', 'reed', 'wood']
    const gain: Partial<Resource> = {}
    for (const res of resources) {
      if ((player.resources[res] ?? 0) >= 2) {
        gain[res] = 1
      }
    }
    if (Object.keys(gain).length === 0) return
    return gainLeaf(CARD_ID, gain)
  },
})

export const B105_CaseBuilder = new Occupation({
  id: CARD_ID,
  name: 'Case Builder',
  deck: 'B',
  number: 105,
  category: 'RESOURCE_WOOD',
  desc: ['When you play this card, you immediately get 1 good of each of the following types, if you have at least 2 of that good in your supply already: <FOOD>, <GRAIN>, <VEGETABLE>, <REED>, <WOOD>.'],
  cost: {},
  players: '1+',
})
