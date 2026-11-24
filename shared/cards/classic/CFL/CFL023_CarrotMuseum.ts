import { defineMinorCard } from '../../card-source'

const CARD_ID = 'CFL023_CarrotMuseum'

export const CFL023_CarrotMuseum = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Carrot Museum',
    deck: 'CFL',
    number: 23,
    cost: { wood: 2, clay: 2 },
    vp: 1,
    maxRound: 7,
    prerequisite: 'Round 7 or before',
    desc: ['At the end of rounds 8, 10, and 12, you get 1 <STONE> for each <VEGETABLE> <FIELD> you have and 1 <WOOD> for each <VEGETABLE> in your supply.'],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL023.png',
  },
  impl: {
    effect: {
      id: CARD_ID,
      timedRules: [{
        key: 'museum-reward',
        at: { kind: 'rounds', rounds: [8, 10, 12], phase: 'onRoundEnd' },
        body: { kind: 'gain', resources: {
          stone: { kind: 'fields', crop: 'vegetable' },
          wood: { kind: 'supply', resource: 'vegetable' },
        } },
      }],
    },
  },
})
