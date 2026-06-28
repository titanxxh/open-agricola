import { defineOccupationCard } from '../card-source'
import { markCardCounterIfBoughtByRound, hasCardCounter } from '../helpers/stage-effects'
import { payGainFlow } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'D099_EarthenwarePotter'

const cardImpl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D099_EarthenwarePotter = defineOccupationCard({
  meta: {
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
    extraVp: true,
  },
  impl: cardImpl,
})

export const D099_EarthenwarePotter_impl = D099_EarthenwarePotter.impl
