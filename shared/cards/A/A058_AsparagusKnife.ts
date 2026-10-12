import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A058_AsparagusKnife'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'field-exchange', at: { kind: 'rounds', rounds: [8, 10, 12], phase: 'onStartReturnHome' }, body: { kind: 'condition', condition: { kind: 'compare', left: { kind: 'fields', crop: 'vegetable' }, operator: 'gt', right: 0 }, body: { kind: 'optional', body: { kind: 'seq', children: [
    { kind: 'operation', operation: { kind: 'take-field-crop', crop: 'vegetable', amount: 1 } },
    { kind: 'gain', resources: { food: 3 } }, { kind: 'action', actionId: 'bonus-vp' },
  ] } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A058_AsparagusKnife = defineMinorCard({
  presentation: { counters: ['bonusVp'], stack: true },
  meta: {
    id: 'A058_AsparagusKnife',
    name: 'Asparagus Knife',
    deck: 'A',
    number: 58,
    category: 'FOOD_PROVIDER',
    desc: ['In the returning home phase of rounds 8, 10, and 12, you can take 1 <VEGETABLE> from exactly 1 <VEGETABLE> <FIELD>. You can immediately exchange it for 3 <FOOD> and 1 bonus <SCORE>.'],
    cost: { wood: 1 },
    implemented: true,
    extraVp: true,
  },
  impl: cardImpl,
})

export const A058_AsparagusKnife_impl = A058_AsparagusKnife.impl
