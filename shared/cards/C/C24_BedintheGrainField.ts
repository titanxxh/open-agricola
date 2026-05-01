import { MinorImprovement } from '../types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C24_BedintheGrainField'

export const C24_BedintheGrainField = new MinorImprovement({
  id: "C24_BedintheGrainField",
  name: "Bed in the Grain Field",
  deck: "C",
  number: 24,
  category: "ACTIONS_BOOSTER",
  desc: ["At the start of the next harvest, you get a __Family Growth__ action if you have room for the newborn."],
  cost: {},
  prerequisite: "1 Grain Field",
  newSet: true,
})

export const C24_BedintheGrainField_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'nextHarvestReady', true)
  },
  onStartHarvest: (_state, player) => {
    const ready = readCardExtraData<boolean>(player, CARD_ID, 'nextHarvestReady')
    if (!ready) return
    writeCardExtraData(player, CARD_ID, 'nextHarvestReady', false)
    if (player.rooms <= familySize(player)) return
    return {
      type: 'leaf',
      actionId: 'family-growth',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
