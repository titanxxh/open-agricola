import { defineOccupationCard } from '../card-source'

export const C180_Trapper = defineOccupationCard({
  meta: {
    id: 'C180_Trapper',
    name: 'Trapper',
    deck: 'C',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time after you use a wood accumulation space, if this is the 2nd/3rd/4th occupied wood accumulation space that round, you can buy 1 sheep/wild boar/cattle for 1 food.'],
    cost: {},
    players: '5+',
  },
})
