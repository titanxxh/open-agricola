import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C037_DwellingMound'
const computeCostsListener: CardListenerRegistration = {
  id: 'C37-dwelling-mound-costs-plow',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { food: 1 } }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C037_DwellingMound = defineMinorCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const C037_DwellingMound_impl = C037_DwellingMound.impl
