import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B4_WoodPile'

const cardImpl = {
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

export const B4_WoodPile = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wood Pile",
    deck: "B",
    number: 4,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["You immediately get a number of <WOOD> equal to the number of people you have on accumulation spaces."],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const B4_WoodPile_impl = B4_WoodPile.impl
