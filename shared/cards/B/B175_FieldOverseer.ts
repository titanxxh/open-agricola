import { defineOccupationCard } from '../card-source'

export const B175_FieldOverseer = defineOccupationCard({
  meta: {
    id: 'B175_FieldOverseer',
    name: 'Field Overseer',
    deck: 'B',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Each time the other players harvest grain from at least 3/4/6 fields combined, you get 1 food/grain/vegetable.'],
    cost: {},
    players: '5+',
  },
})
