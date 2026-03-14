import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C37_DwellingMound'

const computeCostsListener: CardListenerRegistration = {
  id: 'C37-dwelling-mound-costs-plow',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['plow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return { costs: { food: 1 } }
  },
}

registerCardListener(computeCostsListener)

export const C37_DwellingMound = new MinorImprovement({
  id: CARD_ID,
  name: "Dwelling Mound",
  deck: "C",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["From now on, you must pay 1 <FOOD> for each new field tile that you place in your farmyard."],
  cost: { food: 1 },
  prerequisite: "Play in Round 3 or Before",
  vp: 3,
})
