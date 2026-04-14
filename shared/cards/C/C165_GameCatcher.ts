import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C165_GameCatcher'

// Harvests remaining per round (rounds 4, 7, 9, 11, 13, 14)
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const remainingHarvests = harvestRounds.filter((r) => r >= state.round).length
    if (remainingHarvests === 0) {
      return gainLeaf(CARD_ID, { cattle: 1, boar: 1 })
    }
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: remainingHarvests } }),
        gainLeaf(CARD_ID, { cattle: 1, boar: 1 }),
      ],
    }
  },
})

export const C165_GameCatcher = new Occupation({
  id: CARD_ID,
  name: "Game Catcher",
  deck: "C",
  number: 165,
  category: "ANIMAL_HANDLER",
  desc: ["When you play this card, pay 1 <FOOD> for each remaining harvest to immediately get 1 <CATTLE> and 1 <PIG>."],
  players: "4+",
})
