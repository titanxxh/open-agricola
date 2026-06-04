import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B102_Consultant'
const REWARD_BY_PLAYER_COUNT: Record<number, Partial<Resource>> = {
  1: { grain: 2 },
  2: { clay: 3 },
  3: { reed: 2 },
  4: { sheep: 2 },
}

const cardImpl = {
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

export const B102_Consultant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Consultant',
    deck: 'B',
    number: 102,
    category: 'GOODS_PROVIDER',
    desc: ['When you play this card in a 1-/2-/3-/4- player game, you immediately get 2 <GRAIN>/3 <CLAY>/2 <REED>/2 <SHEEP>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B102_Consultant_impl = B102_Consultant.impl
