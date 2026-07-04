import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { buildMoorToFieldFlow } from '../../moor/terrain-flow'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M015_PeatBurnOff'

const compact = (children: Array<ActionFlow | undefined>): ActionFlow | undefined => {
  const flows = children.filter((flow): flow is ActionFlow => flow !== undefined)
  if (flows.length === 0) return
  return flows.length === 1 ? flows[0] : { type: 'seq', children: flows }
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => compact([
      gainLeaf(CARD_ID, { fuel: 1 }),
      buildMoorToFieldFlow(CARD_ID, player, true),
    ]),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M015_PeatBurnOff = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Burn-off",
    deck: "M",
    number: 15,
    category: "FARM_PLANNER",
    desc: [
        "You immediately get 1 <FUEL>. Additionally, you can immediately exchange 1 <MOOR> for 1 <FIELD> tile."
    ],
    cost: {},
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M015_PeatBurnOff_impl = M015_PeatBurnOff.impl
