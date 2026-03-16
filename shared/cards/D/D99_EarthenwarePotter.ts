import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { markCardCounterIfBoughtByRound, hasCardCounter } from '../helpers/stage-effects'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'D99_EarthenwarePotter'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    markCardCounterIfBoughtByRound(state, player, CARD_ID, 'earlyBuy', 4)
  },
  onAfterHarvest: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (!hasCardCounter(player, CARD_ID, 'earlyBuy')) return
    if (state.round < 14) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { clay: player.familySize },
      gain: { score: player.familySize },
      promptKey: 'ui.interactionEarthenwarePotter',
      markTrigger: true,
    })
  },
})

export const D99_EarthenwarePotter = new Occupation({
  id: CARD_ID,
  name: "Earthenware Potter",
  deck: "D",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["If you played this card in round 4 or earlier, after the final harvest you can pay 1 <CLAY> per family member to get 1 bonus <SCORE> each."],
  cost: {},
  players: "1+",
})
