import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C159_FishermansFriend } from '../../cards-display/C/C159_FishermansFriend'

const CARD_ID = C159_FishermansFriend.id

export const C159_FishermansFriend_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const travelingPlayers = state.actionSpaces.find((s) => s.id === 'traveling-players')
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    const tpFood = travelingPlayers?.resources?.food ?? 0
    const fishFood = fishing?.resources?.food ?? 0
    const diff = tpFood - fishFood
    if (diff <= 0) return
    return gainLeaf(CARD_ID, { food: diff })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
