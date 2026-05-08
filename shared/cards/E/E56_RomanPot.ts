import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E56_RomanPot } from '../../cards-display/E/E56_RomanPot'
export { E56_RomanPot }

const CARD_ID = E56_RomanPot.id

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

export const E56_RomanPot_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 4)
    updateInfobox(player, 4)
  },
  onBeforeStartOfTurn: (state, player) => {
    // Check if this player is the last in turn order
    const playerIndex = state.players.indexOf(player)
    if (playerIndex < 0) return
    if (playerIndex !== state.players.length - 1) return
    const foodCount = readCardExtraData<number>(player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    writeCardExtraData(player, CARD_ID, 'foodCount', newCount)
    updateInfobox(player, newCount)
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
