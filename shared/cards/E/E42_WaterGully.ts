import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E42_WaterGully'

export const E42_WaterGully = new MinorImprovement({
  id: CARD_ID,
  name: 'Water Gully',
  deck: 'E',
  number: 42,
  category: 'GOODS_-_GET',
  desc: ['Place 1 <CATTLE>, 1 <GRAIN>, and 1 <CATTLE> on the next 3 round spaces (in that order). At the start of these rounds, you get the respective good.'],
  cost: { stone: 1 },
  prerequisite: 'Major Well',
})

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
