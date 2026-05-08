import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A145_Ropemaker } from '../../cards-display/A/A145_Ropemaker'
export { A145_Ropemaker }

const CARD_ID = A145_Ropemaker.id

export const A145_Ropemaker_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { reed: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
