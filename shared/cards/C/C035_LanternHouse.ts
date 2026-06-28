import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C035_LanternHouse'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return -(player.minorHand.length + player.occupationHand.length)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C035_LanternHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Lantern House",
    deck: "C",
    number: 35,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 negative <SCORE> for each card left in your hand. You cannot discard cards from your hand unplayed. If you already have, you cannot play this card."],
    cost: { wood: 1 },
    vp: 7,
    prerequisite: 'No occupation',
    occupationPrerequisites: { max: 0 },
    extraVp: true,
    preventsHandDiscard: true,
  },
  impl: cardImpl,
})

export const C035_LanternHouse_impl = C035_LanternHouse.impl
