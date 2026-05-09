import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E158_StoneCustodian } from '../../cards-display/E/E158_StoneCustodian'

const CARD_ID = E158_StoneCustodian.id

const STONE_SPACES = ['eastern-quarry', 'western-quarry']

export const E158_StoneCustodian_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, _player) => {
    const count = STONE_SPACES.filter((id) => {
      const space = state.actionSpaces.find((s) => s.id === id)
      return (space?.resources?.stone ?? 0) > 0
    }).length
    if (count === 0) return
    return gainLeaf(CARD_ID, { food: count })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
