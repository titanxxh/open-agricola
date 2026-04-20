import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B77_LoamPit'

const listener: CardListenerRegistration = {
  id: 'B77-loam-pit-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return { flow: gainLeaf(CARD_ID, { clay: 3 }), sourceCard: CARD_ID }
  },
}

export const B77_LoamPit = new MinorImprovement({
  id: CARD_ID,
  name: 'Loam Pit',
  deck: 'B',
  number: 77,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, you also get 3 <CLAY>.'],
  vp: 1,
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})

export const B77_LoamPit_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
