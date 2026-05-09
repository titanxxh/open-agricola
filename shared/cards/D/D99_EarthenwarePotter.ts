import { markCardCounterIfBoughtByRound, hasCardCounter } from '../helpers/stage-effects'
import { payGainFlow } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D99_EarthenwarePotter } from '../../cards-display/D/D99_EarthenwarePotter'

const CARD_ID = D99_EarthenwarePotter.id

export const D99_EarthenwarePotter_impl = {
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
