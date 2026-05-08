import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E61_RaisedBed } from '../../cards-display/E/E61_RaisedBed'

const CARD_ID = E61_RaisedBed.id

export const E61_RaisedBed_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 4 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
