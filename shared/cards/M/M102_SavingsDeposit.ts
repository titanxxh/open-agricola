import { defineMinorCard } from '../card-source'

const CARD_ID = 'M102_SavingsDeposit'

export const M102_SavingsDeposit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Savings Deposit",
    deck: "M",
    number: 102,
    category: "FOOD_PROVIDER",
    desc: [
        "At the start of each harvest, shuffle all start cards and draw one. If its number is equal to or lower than the amount of clay you have, you immediately get 6 food. Then pass this card to the player on your left, who adds it to their hand."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
