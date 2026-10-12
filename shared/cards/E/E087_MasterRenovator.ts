import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E087_MasterRenovator'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'extra-renovation', at: { kind: 'rounds', rounds: [7, 9], phase: 'onStartReturnHome' }, body: { kind: 'operation', operation: { kind: 'discounted-action', actionId: 'renovate-house', discounts: [{ wood: 1 }, { clay: 1 }, { stone: 1 }, { reed: 1 }] } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E087_MasterRenovator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Renovator',
    deck: 'E',
    number: 87,
    category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
    desc: [
        'At the end of the work phases of rounds 7 and 9, you can take a __Renovation__ action without placing a person and pay 1 building resource of your choice less.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E087_MasterRenovator_impl = E087_MasterRenovator.impl
