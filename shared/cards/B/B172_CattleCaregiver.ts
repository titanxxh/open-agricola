import { defineOccupationCard } from '../card-source'

export const B172_CattleCaregiver = defineOccupationCard({
  meta: {
    id: 'B172_CattleCaregiver',
    name: 'Cattle Caregiver',
    deck: 'B',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of each round, if 3/4/5+ players each have at least 1 cattle, you get 1/2/3 food.'],
    cost: {},
    players: '5+',
  },
})
