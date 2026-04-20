import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B40_BreweryPond'

const listener: CardListenerRegistration = {
  id: 'B40-brewery-pond-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'fishing' && id !== 'reed-bank') return
    return { flow: gainLeaf(CARD_ID, { grain: 1, wood: 1 }), sourceCard: CARD_ID }
  },
}

export const B40_BreweryPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Brewery Pond',
  deck: 'B',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Fishing__ or __Reed Bank__ accumulation space, you also get 1 <GRAIN> and 1 <WOOD>.'],
  vp: -1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const B40_BreweryPond_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
