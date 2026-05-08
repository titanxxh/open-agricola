import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B102_Consultant } from '../../cards-display/B/B102_Consultant'

const CARD_ID = B102_Consultant.id

const REWARD_BY_PLAYER_COUNT: Record<number, Partial<Resource>> = {
  1: { grain: 2 },
  2: { clay: 3 },
  3: { reed: 2 },
  4: { sheep: 2 },
}

export const B102_Consultant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const count = state.players.length
    const reward = REWARD_BY_PLAYER_COUNT[count]
    if (!reward) return
    return gainLeaf(CARD_ID, reward)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
