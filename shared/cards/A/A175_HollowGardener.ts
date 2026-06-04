import { defineOccupationCard } from '../card-source'

export const A175_HollowGardener = defineOccupationCard({
  meta: {
    id: 'A175_HollowGardener',
    name: 'Hollow Gardener',
    deck: 'A',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Each time you take at least 3 clay from the "Hollow" accumulation space, you also get 1 grain. If you take at least 6 clay from it, you also get 1 vegetable (instead of grain).'],
    cost: {},
    players: '5+',
  },
})
