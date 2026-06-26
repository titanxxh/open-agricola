import { defineMinorCard } from '../card-source'

const CARD_ID = 'M066_LandParcel'

export const M066_LandParcel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Land Parcel",
    deck: "M",
    number: 66,
    category: "POINTS_PROVIDER",
    desc: [
        "Place 1 forest on an unused farmyard space. During scoring, if you have 1/2/3+ unused farmyard spaces, you get +2/-1/-3 bonus points on top of the negative points for the unused spaces."
    ],
    cost: {},
    extraVp: true,
    prerequisite: "At Most 2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
