import { defineMinorCard } from '../card-source'

const CARD_ID = 'M021_PeatCuttingExpedition'

export const M021_PeatCuttingExpedition = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat-Cutting Expedition",
    deck: "M",
    number: 21,
    category: "GOODS_PROVIDER",
    desc: [
        "Immediately remove any number of visible moors from your farmyard and get 1 bonus point and 2 <FUEL> each. Additionally, if you have at least 2/4/5/6 horses, you immediately get 1/2/3/4 <FUEL>."
    ],
    cost: {
        "food": 4
    },
    extraVp: true,
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
