import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C157_ResourceAnalyzer } from '../../cards-display/C/C157_ResourceAnalyzer'
export { C157_ResourceAnalyzer }

const CARD_ID = C157_ResourceAnalyzer.id

const BUILD_RESOURCES = ['stone', 'clay', 'reed', 'wood'] as const

export const C157_ResourceAnalyzer_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    const otherPlayers = state.players.filter((p) => p.id !== player.id)

    let typesWithMost = 0
    for (const resource of BUILD_RESOURCES) {
      const myAmount = player.resources[resource] ?? 0
      const allOthersLess = otherPlayers.every(
        (other) => (other.resources[resource] ?? 0) < myAmount,
      )
      if (allOthersLess) typesWithMost++
    }

    if (typesWithMost >= 2) return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
