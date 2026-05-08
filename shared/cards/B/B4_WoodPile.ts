import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B4_WoodPile } from '../../cards-display/B/B4_WoodPile'
export { B4_WoodPile }

const CARD_ID = B4_WoodPile.id

export const B4_WoodPile_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      let count = 0
      for (const space of state.actionSpaces) {
        // accumulation space marker: gainPerRound non-empty
        if (Object.keys(space.gainPerRound ?? {}).length === 0) continue
        if (space.takenBy.some((w) => w.playerId === player.id)) {
          count++
        }
      }
      if (count <= 0) return undefined
      return gainLeaf(CARD_ID, { wood: count })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
