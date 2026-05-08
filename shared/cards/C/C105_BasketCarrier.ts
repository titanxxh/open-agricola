import { Occupation } from '../../cards-display/types'

const CARD_ID = 'C105_BasketCarrier'

export const C105_BasketCarrier = new Occupation({
  id: CARD_ID,
  name: 'Basket Carrier',
  deck: 'C',
  number: 105,
  category: 'GOODS_PROVIDER',
  desc: ['Once each harvest, you can buy 1 <WOOD>, 1 <REED>, and 1 <GRAIN> for 2 <FOOD> total.'],
  cost: {},
  players: '1+',
  // Reverse trade: spend 2 food, gain 1 wood + 1 reed + 1 grain. The harvest
  // selector consumer applies bidirectionally when the selection includes
  // exchangeIndex (Sprint 6a generic selection model).
  exchanges: [
    {
      from: { food: 2 },
      to: { wood: 1, reed: 1, grain: 1 },
      max: 1,
      sourceId: CARD_ID,
      triggers: ['harvest'],
    },
  ],
})
