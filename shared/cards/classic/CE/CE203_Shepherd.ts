import { defineOccupationCard } from '../../card-source'

const CARD_ID = 'CE203_Shepherd'

export const CE203_Shepherd = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Shepherd',
    deck: 'CE',
    number: 203,
    desc: ['During each breeding phase, if you have at least 4 <sheep>, your <sheep> produce 2 offspring instead of 1, as long as you have room for them.'],
    players: '4+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      computeBreedOffspringCount: (_state, _player, animalType, count, ctx) =>
        animalType === 'sheep' && ctx.breedableCount >= 4 ? Math.max(2, count) : undefined,
    },
  },
})
