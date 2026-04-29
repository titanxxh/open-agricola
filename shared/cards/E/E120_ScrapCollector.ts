import { Occupation } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E120_ScrapCollector'

export const E120_ScrapCollector = new Occupation({
  id: CARD_ID,
  name: 'Scrap Collector',
  deck: 'E',
  number: 120,
  category: 'BUILDING_RESOURCES_-_CLAY_(AND_WOOD)',
  desc: ['Alternate placing 1 <WOOD> and 1 <CLAY> on each of the next 6 round spaces, starting with <WOOD>. At the start of these rounds, you get the respective resource.'],
  players: '1+',
})

export const E120_ScrapCollector_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const r = state.round
    const woodRounds = [r + 1, r + 3, r + 5].filter((round) => round <= 14)
    const clayRounds = [r + 2, r + 4, r + 6].filter((round) => round <= 14)

    const children: ActionFlow[] = []

    if (woodRounds.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: woodRounds.map((round) => ({ round, resources: { wood: 1 } })),
      })
      children.push(futureMeeplesNode())
    }
    if (clayRounds.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: clayRounds.map((round) => ({ round, resources: { clay: 1 } })),
      })
      children.push(futureMeeplesNode())
    }

    if (children.length === 0) return
    if (children.length === 1) return children[0]
    return { type: 'seq' as const, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
