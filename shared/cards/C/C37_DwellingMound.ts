import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { C37_DwellingMound } from '../../cards-display/C/C37_DwellingMound'
export { C37_DwellingMound }

const CARD_ID = C37_DwellingMound.id

const computeCostsListener: CardListenerRegistration = {
  id: 'C37-dwelling-mound-costs-plow',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { food: 1 } }
  },
}

export const C37_DwellingMound_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
