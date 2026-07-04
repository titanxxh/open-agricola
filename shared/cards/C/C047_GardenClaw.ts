import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C047_GardenClaw'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const plantedFields = player.fields.filter((f) => !fieldIsEmpty(f)).length
    if (plantedFields === 0) return
    const count = plantedFields * 3
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C047_GardenClaw = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Garden Claw",
    deck: "C",
    number: 47,
    category: "FOOD_PROVIDER",
    desc: ["Place 1 <FOOD> on each remaining round space, up to three times the number of planted <FIELD> you have. At the start of these rounds, you get the <FOOD>."],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const C047_GardenClaw_impl = C047_GardenClaw.impl
