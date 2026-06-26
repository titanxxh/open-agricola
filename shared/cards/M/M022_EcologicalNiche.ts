import { defineMinorCard } from '../card-source'

const CARD_ID = 'M022_EcologicalNiche'

export const M022_EcologicalNiche = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Ecological Niche",
    deck: "M",
    number: 22,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 2 <FOOD> if you have an animal type that no one else has; 1 <FOOD> each if only you are growing grain and/or vegetables; 1 <FUEL> each if you have the single most forests and/or moors."
    ],
    cost: {},
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
