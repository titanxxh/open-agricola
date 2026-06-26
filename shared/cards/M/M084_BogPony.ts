import { defineMinorCard } from '../card-source'

const CARD_ID = 'M084_BogPony'

export const M084_BogPony = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bog Pony",
    deck: "M",
    number: 84,
    category: "GOODS_PROVIDER",
    desc: [
        "At any time, you can lie a standing horse on its side to get 2 fuel. Lying horses do not count for breeding and are only worth 1/2 point during scoring. They can, however, be turned into food with an appropriate improvement."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
