import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'D099_EarthenwarePotter'

const cardImpl = {
  effect: {
    id: CARD_ID,
  onBuy: (state, player) => { writeCardExtraData(player, CARD_ID, 'purchaseRound', state.round) },
  timedRules: [{ key: 'final-clay-exchange', at: { kind: 'rounds', rounds: [14], phase: 'onAfterHarvest' }, body: { kind: 'condition', condition: { kind: 'purchased-by-round', round: 4, fact: 'purchaseRound' }, body: { kind: 'operation', operation: { kind: 'bounded-exchange', maximum: { kind: 'family' }, cost: { clay: 1 }, gain: {}, bonusVp: 1, quantity: 'maximum' } } } }],
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
