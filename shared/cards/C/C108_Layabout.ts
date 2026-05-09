import { writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C108_Layabout } from '../../cards-display/C/C108_Layabout'

const CARD_ID = C108_Layabout.id

export const C108_Layabout_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'skipNextHarvest', true)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
