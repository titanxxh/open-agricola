import { defineMinorCard } from '../card-source'

const CARD_ID = 'M112_PeatAshFertilizer'

export const M112_PeatAshFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Ash Fertilizer",
    deck: "M",
    number: 112,
    category: "CROP_PROVIDER",
    desc: [
        "Each time before you take the \"Cut Peat\" special action, you can place 1 additional crop of the same type on all fields and farmyard spaces containing grain or vegetables. Do not place any crops on empty fields and farmyard spaces."
    ],
    cost: {
        "vegetable": 1
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
