import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D032_WoodRake'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'final-crops', at: { kind: 'rounds', rounds: [14], phase: 'onBeforeHarvest' }, body: { kind: 'condition', condition: { kind: 'compare', left: { kind: 'crop-total' }, operator: 'ge', right: 7 }, body: { kind: 'seq', children: [{ kind: 'action', actionId: 'bonus-vp' }, { kind: 'action', actionId: 'bonus-vp' }] } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D032_WoodRake = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wood Rake",
    deck: "D",
    number: 32,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, if you had at least 7 goods in your <FIELD> before the final harvest, you get 2 bonus <SCORE>."],
    cost: { wood: 1 },
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const D032_WoodRake_impl = D032_WoodRake.impl
