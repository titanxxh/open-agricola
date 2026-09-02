import { defineOccupationCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D153_WealthyMan'
const harvestGrainFieldThreshold: Record<number, number> = {
  4: 1,
  7: 2,
  9: 3,
  11: 4,
  13: 5,
  14: 6,
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (state, player) => {

    const threshold = harvestGrainFieldThreshold[state.round]
    if (threshold === undefined) return

    const grainFieldCount = getLogicalFields(player).filter(
      (field) => field.stacks.some((stack) => stack.kind === 'grain'),
    ).length
    if (grainFieldCount < threshold) return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D153_WealthyMan = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Wealthy Man",
    deck: "D",
    number: 153,
    category: "POINTS_PROVIDER",
    desc: ["At the start of each of the 1st/2nd/3rd/4th/5th/6th harvest, if you have at least 1/2/3/4/5/6 <GRAIN> <FIELD>, you get 1 bonus <SCORE>."],
    cost: {},
    players: "4+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D153_WealthyMan_impl = D153_WealthyMan.impl
