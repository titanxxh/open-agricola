import { defineOccupationCard } from '../card-source'

export const C172_FieldCounter = defineOccupationCard({
  meta: {
    id: 'C172_FieldCounter',
    name: 'Field Counter',
    deck: 'C',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['Each time another player plows a field, place 1 food on this card. Once this game, you can turn this card face down to get the food on it.'],
    cost: {},
    players: '5+',
  },
})
