import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C123_Freemason } from '../../cards-display/C/C123_Freemason'
export { C123_Freemason }

const CARD_ID = C123_Freemason.id

export const C123_Freemason_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount !== 2) return
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { stone: 2 })
    }
    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { clay: 2 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
