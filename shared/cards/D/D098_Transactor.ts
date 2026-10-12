import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D098_Transactor'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'final-board-collection', at: { kind: 'rounds', rounds: [14], phase: 'onBeforeHarvest' }, body: { kind: 'optional', promptKey: 'ui.cards.D098_Transactor.prompt', body: { kind: 'operation', operation: { kind: 'collect-board-resources', resources: ['wood', 'clay', 'reed', 'stone'] } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D098_Transactor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Transactor",
    deck: "D",
    number: 98,
    category: "POINTS_PROVIDER",
    desc: ["Immediately before the final harvest at the end of round 14, you can take all the building resources that are left on the entire game board."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D098_Transactor_impl = D098_Transactor.impl
