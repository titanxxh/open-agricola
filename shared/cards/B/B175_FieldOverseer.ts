import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B175_FieldOverseer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: (state, player) => {
      const summary = state.harvestReapSummary
      if (!summary) return
      const otherGrainFields = state.players
        .filter((candidate) => candidate.id !== player.id)
        .reduce((sum, candidate) => sum + (summary[candidate.id]?.grainFields ?? 0), 0)
      if (otherGrainFields >= 6) return gainLeaf(CARD_ID, { vegetable: 1 })
      if (otherGrainFields >= 4) return gainLeaf(CARD_ID, { grain: 1 })
      if (otherGrainFields >= 3) return gainLeaf(CARD_ID, { food: 1 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B175_FieldOverseer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Field Overseer',
    deck: 'B',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Each time the other players harvest <GRAIN> from at least 3/4/6 <FIELD> combined, you get 1 <FOOD>/<GRAIN>/<VEGETABLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B175_FieldOverseer_impl = B175_FieldOverseer.impl
