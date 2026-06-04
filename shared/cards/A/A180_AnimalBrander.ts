import { defineOccupationCard } from '../card-source'

export const A180_AnimalBrander = defineOccupationCard({
  meta: {
    id: 'A180_AnimalBrander',
    name: 'Animal Brander',
    deck: 'A',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use the "Animal Market" action space, you can pay 1 food to use the same option twice (instead of once).'],
    cost: {},
    players: '5+',
  },
})
