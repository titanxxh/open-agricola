import { defineMinorCard } from '../card-source'

const CARD_ID = 'B80_HardPorcelain'

export const B80_HardPorcelain = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hard Porcelain',
    deck: 'B',
    number: 80,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['At any time, you can exchange 2/3/4 <CLAY> for 1/2/3 <STONE>.'],
    cost: { clay: 1 },
    exchanges: [
        { from: { clay: 2 }, to: { stone: 1 }, triggers: ['anytime'] },
        { from: { clay: 3 }, to: { stone: 2 }, triggers: ['anytime'] },
        { from: { clay: 4 }, to: { stone: 3 }, triggers: ['anytime'] },
      ],
  },
})
