import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'

const CARD_ID = 'E87_MasterRenovator'

/**
 * E87 Master Renovator — Occupation.
 * At the end of the work phases of rounds 7 and 9, if you don't have a stone house,
 * you can take a Renovation action for free, paying 1 building resource less.
 *
 * BGA: isListeningTo → EndWorkPhase in rounds 7 and 9.
 * onPlayerEndWorkPhase → if not stone house, optional renovation flow with flag.
 * onPlayerComputeCostsRenovation → if flagged (sourceCard===CARD_ID), -1 on one building resource
 * (addBonusChoices: wood -1 / clay -1 / stone -1 / reed -1).
 * Simplified: apply -1 reed discount when triggered by this card.
 */

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

// Cost discount: -1 reed when triggered by this card (simplification of BGA's choice of any 1 building resource).
const costListener: CardListenerRegistration = {
  id: 'E87-master-renovator-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.sourceCard !== CARD_ID) return
    return { costs: { reed: -1 } }
  },
}

registerCardListener(costListener)

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
