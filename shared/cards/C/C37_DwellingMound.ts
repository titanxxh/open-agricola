import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C37_DwellingMound'

const computeCostsListener: CardListenerRegistration = {
  id: 'C37-dwelling-mound-costs-plow',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { food: 1 } }
  },
}

export const C37_DwellingMound = new MinorImprovement({
  id: CARD_ID,
  name: "Dwelling Mound",
  deck: "C",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["From now on, you must pay 1 <FOOD> for each new field tile that you place in your farmyard."],
  cost: { food: 1 },
  prerequisite: "Play in Round 3 or Before",
  maxRound: 3,
  vp: 3,
})

export const C37_DwellingMound_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
