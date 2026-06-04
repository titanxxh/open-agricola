import { defineOccupationCard } from '../card-source'

const CARD_ID = 'C105_BasketCarrier'

export const C105_BasketCarrier = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Basket Carrier',
    deck: 'C',
    number: 105,
    category: 'GOODS_PROVIDER',
    desc: ['Once each harvest, you can buy 1 <WOOD>, 1 <REED>, and 1 <GRAIN> for 2 <FOOD> total.'],
    cost: {},
    players: '1+',
    exchanges: [
        {
          from: { food: 2 },
          to: { wood: 1, reed: 1, grain: 1 },
          max: 1,
          sourceId: CARD_ID,
          triggers: ['harvest'],
        },
      ],
  },
})
