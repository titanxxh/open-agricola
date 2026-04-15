import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B37_Grange'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
})

export const B37_Grange = new MinorImprovement({
  id: CARD_ID,
  name: 'Grange',
  deck: 'B',
  number: 37,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <FOOD>.'],
  cost: {},
  vp: 3,
  prerequisite: '6 Field Tiles and All Animal Types',
})
