import { defineOccupationCard } from '../card-source'

export const D172_PutcherMaker = defineOccupationCard({
  meta: {
    id: 'D172_PutcherMaker',
    name: 'Putcher Maker',
    deck: 'D',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can exchange 1 <REED> for 2 <FOOD>.'],
    cost: {},
    players: '5+',
    exchanges: [
      { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    ],
  },
})
