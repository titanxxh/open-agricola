import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'

const CARD_ID = 'B102_Consultant'

// BGA: 1p→2 grain, 2p→3 clay, 3p→2 reed, 4p→2 sheep.
const REWARD_BY_PLAYER_COUNT: Record<number, Partial<Resource>> = {
  1: { grain: 2 },
  2: { clay: 3 },
  3: { reed: 2 },
  4: { sheep: 2 },
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const count = state.players.length
    const reward = REWARD_BY_PLAYER_COUNT[count]
    if (!reward) return
    return gainLeaf(CARD_ID, reward)
  },
})

export const B102_Consultant = new Occupation({
  id: CARD_ID,
  name: 'Consultant',
  deck: 'B',
  number: 102,
  category: 'RESOURCE_CLAY',
  desc: ['When you play this card in a 1-/2-/3-/4- player game, you immediately get 2 <GRAIN>/3 <CLAY>/2 <REED>/2 <SHEEP>.'],
  cost: {},
  players: '1+',
})
