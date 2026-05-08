import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C24_BedintheGrainField } from '../../cards-display/C/C24_BedintheGrainField'
export { C24_BedintheGrainField }

const CARD_ID = 'C24_BedintheGrainField'

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
