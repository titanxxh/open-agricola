import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M074_Administration'

const cardImpl = {
  prerequisiteCheck: player => (player.minorHand ?? []).filter(id => !id.startsWith('__')).length <= 4,
  effect: {
    id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
  timedRules: [{ key: 'final-food-exchange', at: { kind: 'rounds', rounds: [14], phase: 'onHarvestFeedingPhase' }, body: { kind: 'operation', operation: { kind: 'bounded-exchange', maximum: { kind: 'major-improvements' }, cost: { food: 1 }, gain: {}, bonusVp: 1, quantity: 'choose' } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M074_Administration = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Administration",
    deck: "M",
    number: 74,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 <FOOD>. In the harvest at the end of round 14, for each major improvement you have, you can exchange 1 <FOOD> for 1 bonus <SCORE>. This card counts as an improvement in hand for its prerequisite."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    extraVp: true,
    prerequisite: "At Most 4 Improvements in Hand",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const M074_Administration_impl = M074_Administration.impl
