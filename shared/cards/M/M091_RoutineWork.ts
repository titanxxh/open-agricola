import { defineMinorCard } from '../card-source'

const CARD_ID = 'M091_RoutineWork'

export const M091_RoutineWork = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Routine Work",
    deck: "M",
    number: 91,
    category: "GOODS_PROVIDER",
    desc: [
        "Each harvest, you get your choice of 1 fuel or 1 food for each of your craft buildings (Joinery, Pottery, and Basketmaker's Workshop) that you choose not to use to turn a building resource into food."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "No Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
