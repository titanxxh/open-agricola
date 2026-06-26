import { defineMinorCard } from '../card-source'

const CARD_ID = 'M031_LivestockMarket'

export const M031_LivestockMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Livestock Market",
    deck: "M",
    number: 31,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "You can immediately exchange up to 3 animals of any type at the same time, if you can accommodate them: <SHEEP> <ARROW> <PIG> <ARROW> <CATTLE> <ARROW> <HORSE>."
    ],
    cost: {},
    prerequisite: "5 Animals",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
