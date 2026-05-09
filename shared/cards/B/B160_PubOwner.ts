import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B160_PubOwner } from '../../cards-display/B/B160_PubOwner'

const CARD_ID = B160_PubOwner.id

export const B160_PubOwner_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { grain: 1 }),
  onBeforeReturnHome: (state, _player) => {
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!forest || !clayPit || !reedBank) return
    if (!isSpaceOccupied(forest) || !isSpaceOccupied(clayPit) || !isSpaceOccupied(reedBank)) return
    return gainLeaf(CARD_ID, { grain: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
