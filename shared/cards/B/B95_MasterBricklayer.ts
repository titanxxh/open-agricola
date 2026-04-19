import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B95_MasterBricklayer'

/**
 * B95 Master Bricklayer — Each time you build a major improvement, reduce the stone cost
 * by the number of rooms you have built onto your initial house.
 * BGA: onPlayerComputeCardCosts, applies to MAJOR type only.
 * Discount = (current rooms - 2) stone.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'B95-master-bricklayer-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only applies to major improvements
    const cardId = context.cardId
    if (!cardId || !cardId.startsWith('Major_')) return
    const nbNewRooms = (context.player.rooms ?? 2) - 2
    if (nbNewRooms <= 0) return
    return { costs: { stone: -nbNewRooms } }
  },
}

registerCardListener(computeCostsListener)

export const B95_MasterBricklayer = new Occupation({
  id: CARD_ID,
  name: 'Master Bricklayer',
  deck: 'B',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you build a major improvement, reduce the <STONE> cost by the number of rooms you have built onto your initial house.'],
  cost: {},
  players: '1+',
})
