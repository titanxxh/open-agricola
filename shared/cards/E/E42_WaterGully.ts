import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { E42_WaterGully } from '../../cards-display/E/E42_WaterGully'
export { E42_WaterGully }

const CARD_ID = E42_WaterGully.id

registerPrerequisite('Major Well', (player) => player.improvements.includes('Major_Well'))

export const E42_WaterGully_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const r = state.round
    const entries = [
      { round: r + 1, resources: { cattle: 1 } },
      { round: r + 2, resources: { grain: 1 } },
      { round: r + 3, resources: { cattle: 1 } },
    ].filter((e) => e.round <= 14)

    if (entries.length === 0) return

    // Queue all entries together grouped by resource type
    const cattleEntries = entries.filter((e) => 'cattle' in e.resources)
    const grainEntries = entries.filter((e) => 'grain' in e.resources)

    if (cattleEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: cattleEntries,
      })
    }
    if (grainEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: grainEntries,
      })
    }

    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
