import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E107_LandSurveyor } from '../../cards-display/E/E107_LandSurveyor'

const CARD_ID = E107_LandSurveyor.id

export const E107_LandSurveyor_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {

    const fieldCount = player.fields.length
    let food = 0
    if (fieldCount >= 7) food = 4
    else if (fieldCount >= 6) food = 3
    else if (fieldCount >= 4) food = 2
    else if (fieldCount >= 2) food = 1

    if (food === 0) return
    return gainLeaf(CARD_ID, { food })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
