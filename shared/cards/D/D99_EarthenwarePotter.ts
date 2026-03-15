import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { markCardCounterIfBoughtByRound, hasCardCounter, stagePayGainFlow } from '../helpers/stage-effects'

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
    return stagePayGainFlow(
      CARD_ID,
      { clay: player.familySize },
      { score: player.familySize },
      'ui.interactionEarthenwarePotter',
    )
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
