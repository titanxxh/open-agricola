import { defineMinorCard } from '../card-source'

const CARD_ID = 'M071_BogBody'

export const M071_BogBody = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bog Body",
    deck: "M",
    number: 71,
    category: "POINTS_PROVIDER",
    desc: [
        "During scoring, the owner of the Museum of the Moors and the owner of the Living History Museum each get 1 bonus point. The Museum of the Moors is a major improvement; the Living History Museum is a minor improvement."
    ],
    cost: {},
    vp: 1,
    extraVp: true,
    prerequisite: "At Least 1 Moor",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
