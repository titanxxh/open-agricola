import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { buildRemoveTerrainFlow } from '../../moor/terrain-flow'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M021_PeatCuttingExpedition'

const compact = (children: Array<ActionFlow | undefined>): ActionFlow | undefined => {
  const flows = children.filter((flow): flow is ActionFlow => flow !== undefined)
  if (flows.length === 0) return
  return flows.length === 1 ? flows[0] : { type: 'seq', children: flows }
}

const horseFuel = (horse = 0) => {
  if (horse >= 6) return 4
  if (horse >= 5) return 3
  if (horse >= 4) return 2
  if (horse >= 2) return 1
  return 0
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fuel = horseFuel(player.resources.horse ?? 0)
      return compact([
        buildRemoveTerrainFlow(CARD_ID, player, 'moor', {
          gainPerSelection: { fuel: 2 },
          bonusVpPerSelection: 1,
        }),
        fuel > 0 ? gainLeaf(CARD_ID, { fuel }) : undefined,
      ])
    },
    computeBonusScore: (_state, player) =>
      player.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M021_PeatCuttingExpedition = defineMinorCard({
  presentation: { counters: ['bonusVp'] },
  meta: {
    id: CARD_ID,
    name: "Peat-Cutting Expedition",
    deck: "M",
    number: 21,
    category: "GOODS_PROVIDER",
    desc: [
        "Immediately remove any number of visible <MOOR> from your farmyard and get 1 bonus <SCORE> and 2 <FUEL> each. Additionally, if you have at least 2/4/5/6 <HORSE>, you immediately get 1/2/3/4 <FUEL>."
    ],
    cost: {
        "food": 4
    },
    extraVp: true,
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M021_PeatCuttingExpedition_impl = M021_PeatCuttingExpedition.impl
