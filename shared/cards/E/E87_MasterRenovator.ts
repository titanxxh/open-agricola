import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'
import type { CardImpl } from '../registry'

const CARD_ID = 'E87_MasterRenovator'

// Cost discount: -1 reed when triggered by this card (simplification of BGA's choice of any 1 building resource).
const costListener: CardListenerRegistration = {
  id: 'E87-master-renovator-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return { costs: { reed: -1 } }
  },
}

export const E87_MasterRenovator = new Occupation({
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
})

export const E87_MasterRenovator_impl = {
  listeners: [costListener],
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (state.round !== 7 && state.round !== 9) return
    if (player.houseType === 'stone') return
    const renovation = getRenovation(player)
    if (!renovation) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'renovate-house',
          optional: true,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
