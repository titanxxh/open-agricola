import { defineOccupationCard } from '../card-source'

export const D180_PartTimeWorker = defineOccupationCard({
  meta: {
    id: 'D180_PartTimeWorker',
    name: 'Part-Time Worker',
    deck: 'D',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use an accumulation space with exactly 2/4/6 goods on it, you can leave 1/2/3 goods on the space. If you do, you get 1 sheep/wild boar/cattle.'],
    cost: {},
    players: '5+',
  },
})
