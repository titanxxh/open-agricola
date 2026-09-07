import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E084_DollysMother'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones) => {
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      capacity: 1,
      allowedAnimalType: 'sheep',
    })
  },
  computeBreedThreshold: (_state, _player, animalType, { sourceCard }) => {
    if (sourceCard !== 'harvest') return
    if (animalType !== 'sheep') return
    return 1
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E084_DollysMother = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Dolly's Mother",
    deck: "E",
    number: 84,
    desc: ["You only require 1 <SHEEP> to breed <SHEEP> during the breeding phase of a harvest. This card can hold 1 <SHEEP>."],
    cost: {},
    animalHolder: true,
    vp: 1,
    prerequisite: "1 Sheep",
    category: 'ANIMALS_',
  },
  impl: cardImpl,
})

export const E084_DollysMother_impl = E084_DollysMother.impl
