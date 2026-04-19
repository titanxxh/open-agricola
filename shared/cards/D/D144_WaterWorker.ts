import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D144_WaterWorker'

// BGA: After Fishing (collect), DayLaborer, ReedBank, or the round 4 action space → gain 1 reed.
// Fishing triggers on collect (food accumulation), others on place-farmer.
const TRIGGER_SPACE_IDS = new Set(['day-laborer', 'reed-bank'])

const isRound4ActionSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const roundOrder = context.state.roundActionOrder
  // Round 4 is index 3 (0-based)
  const round4SpaceId = roundOrder[3]
  return round4SpaceId !== null && context.space.id === round4SpaceId
}

const collectListener: CardListenerRegistration = {
  id: 'D144-water-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
  },
}

const placeFarmerListener: CardListenerRegistration = {
  id: 'D144-water-worker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (TRIGGER_SPACE_IDS.has(context.space.id) || isRound4ActionSpace(context)) {
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(collectListener)
registerCardListener(placeFarmerListener)

export const D144_WaterWorker = new Occupation({
  id: CARD_ID,
  name: 'Water Worker',
  deck: 'D',
  number: 144,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time after you use any of the __Fishing__, __Reed Bank__, __Day Laborer__ spaces or the action space of round 4, you get 1 additional <REED>.',
  ],
  cost: {},
  players: '3+',
})
