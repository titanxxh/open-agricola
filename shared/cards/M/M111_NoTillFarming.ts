import { defineMinorCard } from '../card-source'

const CARD_ID = 'M111_NoTillFarming'

export const M111_NoTillFarming = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "No-Till Farming",
    deck: "M",
    number: 111,
    category: "CROP_PROVIDER",
    desc: [
        "You can plant grain or vegetables on up to 2 unused farmyard spaces. Even if you do, these farmyard spaces are not considered fields but still unused. You can discard crops from these farmyard spaces at any time."
    ],
    cost: {},
    prerequisite: "2 Fields",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
