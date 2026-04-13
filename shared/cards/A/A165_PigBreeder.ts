import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A165_PigBreeder'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { boar: 1 })
  },
})

export const A165_PigBreeder = new Occupation({
  id: "A165_PigBreeder",
  name: "Pig Breeder",
  deck: "A",
  number: 165,
  category: "LIVESTOCK_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <PIG>. Your <PIG> breed at the end of round 12 (if there is room for the new <PIG>)."],
  cost: {},
  players: "4+",
})
