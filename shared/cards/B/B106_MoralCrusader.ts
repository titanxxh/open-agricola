import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B106_MoralCrusader } from '../../cards-display/B/B106_MoralCrusader'

const CARD_ID = B106_MoralCrusader.id

export const B106_MoralCrusader_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    // Check if player has any future meeple entries (goods promised for future rounds)
    const upcomingRound = state.round + 1
    const hasFutureGoods = state.futureMeeples.some(
      (entry) => entry.playerId === player.id &&
                 entry.round >= upcomingRound &&
                 Object.values(entry.resources ?? {}).some((v) => (v as number) > 0),
    )
    if (!hasFutureGoods) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
