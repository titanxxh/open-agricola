import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D62_BeerTap'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
  // TODO: implement harvest-time grain->food exchange (2/3/4 grain -> 3/6/9 food)
})

export const D62_BeerTap = new MinorImprovement({
  id: CARD_ID,
  name: 'Beer Tap',
  deck: 'D',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, you immediately get 2 <FOOD>. In the feeding phase of each harvest, you can turn 2/3/4 <GRAIN> into 3/6/9 <FOOD>.'],
  cost: { wood: 1 },
  newSet: true,
})
