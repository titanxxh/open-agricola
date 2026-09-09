import { defineOccupationCard } from '../card-source'

const CARD_ID = 'D108_StoneCarver'

export const D108_StoneCarver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stone Carver',
    deck: 'D',
    number: 108,
    category: 'FOOD_PROVIDER',
    desc: ['Each harvest, you can use this card to turn exactly 1 <STONE> into 3 <FOOD>.'],
    cost: {},
    players: '1+',
    waresSalesmanGains: [{ stone: 1, reed: 1 }],
    exchanges: [
        { from: { stone: 1 }, to: { food: 3 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
      ],
  },
})
