import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A165_PigBreeder'

const cardImpl = {
  effect: {
    id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { boar: 1 }),
  timedRules: [{ key: 'extra-breeding', at: { kind: 'rounds', rounds: [12], phase: 'onAfterRoundEnd' }, body: { kind: 'condition', condition: { kind: 'compare', left: { kind: 'supply', resource: 'boar' }, operator: 'ge', right: 2 }, body: { kind: 'operation', operation: { kind: 'breed-animals', animals: ['boar'], requireCapacity: true } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A165_PigBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pig Breeder',
    deck: 'A',
    number: 165,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['When you play this card, you immediately get 1 <PIG>. Your <PIG> breed at the end of round 12 (if there is room for the new <PIG>).'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A165_PigBreeder_impl = A165_PigBreeder.impl
