import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E56_RomanPot'

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

registerCardEffect({
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
})

export const E56_RomanPot = new MinorImprovement({
  id: CARD_ID,
  name: 'Roman Pot',
  deck: 'E',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Place 4 <FOOD> from the general supply on this card. At the start of each work phase, if you are the last player in turn order, move 1 <FOOD> from this card to your supply.'],
  cost: { clay: 1 },
  vp: 1,
})
