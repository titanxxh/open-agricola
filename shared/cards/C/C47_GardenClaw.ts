import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C47_GardenClaw } from '../../cards-display/C/C47_GardenClaw'
export { C47_GardenClaw }

const CARD_ID = C47_GardenClaw.id

export const C47_GardenClaw_impl = {
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
