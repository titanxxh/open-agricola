import { defineMinorCard } from '../card-source'
import { writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C024_BedintheGrainField'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'nextHarvestReady', true)
  },
  timedRules: [{ key: 'next-harvest-growth', at: { kind: 'flag', fact: 'nextHarvestReady', clock: 'next-harvest', phase: 'onStartHarvest' },
    consume: { clearFlag: 'nextHarvestReady' },
    body: { kind: 'condition', condition: { kind: 'room-for-newborn' }, body: { kind: 'optional', body: { kind: 'action', actionId: 'family-growth' } } },
  }],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C024_BedintheGrainField = defineMinorCard({
  meta: {
    id: "C024_BedintheGrainField",
    name: "Bed in the Grain Field",
    deck: "C",
    number: 24,
    category: "ACTIONS_BOOSTER",
    desc: ["At the start of the next harvest, you get a __Family Growth__ action if you have room for the newborn."],
    cost: {},
    prerequisite: "1 Grain Field",
  },
  impl: cardImpl,
})

export const C024_BedintheGrainField_impl = C024_BedintheGrainField.impl
