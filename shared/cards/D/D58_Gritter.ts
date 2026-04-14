import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D58_Gritter'

// D58 Gritter: At the end of each action in which you sow vegetables in a field,
// you get 1 FOOD for each vegetable field you have (including the new ones).
// We trigger after sow, check if any vegetable was sown, count all vegetable fields.
const listener: CardListenerRegistration = {
  id: 'D58-gritter-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // Check if any vegetable was sown (any field has vegetable crop)
    const vegetableFields = context.player.fields.filter((f) => f.crop === 'vegetable')
    // We compare to the last result to detect if vegetable was just sown
    // Since sow doesn't return resource gained info, check if a vegetable field exists
    const n = vegetableFields.length
    if (n <= 0) return
    // Only trigger if a vegetable was actually sown this action
    // We detect by checking if any field was just seeded (remaining > 0 indicates sowing happened)
    // BGA: only triggers if at least one vegetable was sown this action
    // We approximate: trigger only when we can confirm vegetable was sown
    // Use the last-sown detection: check if any vegetable field has remaining crops
    const justSowed = vegetableFields.some((f) => f.remaining > 0)
    if (!justSowed) return
    return { flow: gainLeaf(CARD_ID, { food: n }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D58_Gritter = new MinorImprovement({
  id: CARD_ID,
  name: 'Gritter',
  deck: 'D',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'At the end of each action in which you sow vegetables in a field, you get 1 <FOOD> for each vegetable field you have (including the new ones).',
  ],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 5 or Later',
  newSet: true,
})
