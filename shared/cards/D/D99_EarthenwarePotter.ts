import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { markCardCounterIfBoughtByRound, hasCardCounter } from '../helpers/stage-effects'
import { payGainFlow } from '../helpers/pay-gain-node'
import { familySize } from '../../game/player'

const CARD_ID = 'D99_EarthenwarePotter'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    markCardCounterIfBoughtByRound(state, player, CARD_ID, 'earlyBuy', 4)
  },
  onAfterHarvest: (state, player) => {
    if (!hasCardCounter(player, CARD_ID, 'earlyBuy')) return
    if (state.round < 14) return
    const n = Math.min(player.resources.clay ?? 0, familySize(player))
    if (n <= 0) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { clay: n },
      gain: { score: n },
      promptKey: 'ui.interactionEarthenwarePotter',
    })
  },
})

export const D99_EarthenwarePotter = new Occupation({
  id: CARD_ID,
  name: "Earthenware Potter",
  deck: "D",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: [
    'If you play this card in round 4 or before, after the final harvest, you get 1 bonus <SCORE> for each person for which you then pay 1 <CLAY>.',
  ],
  cost: {},
  players: "1+",
})
