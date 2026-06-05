import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'
import type { CardImpl } from '../registry'
import type { Bonus } from '../../contract/types'

const CARD_ID = 'B128_Plumber'
const triggerListener: CardListenerRegistration = {
  id: 'B128-plumber-after-place-farmer-major-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'major-improvement') return
    // Only offer if renovation is actually possible
    const renovation = getRenovation(context.player)
    if (!renovation) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const costListener: CardListenerRegistration = {
  id: 'B128-plumber-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const renovation = getRenovation(context.player)
    if (!renovation) return
    const bonus = (resource: 'clay' | 'stone'): Bonus => ({
      choices: [
        { discount: { [resource]: 1 } },
        { discount: { [resource]: 2 } },
      ],
      optional: false,
      sources: [CARD_ID],
    })
    if (renovation.nextType === 'clay') {
      return { bonuses: [bonus('clay')] }
    }
    if (renovation.nextType === 'stone') {
      return { bonuses: [bonus('stone')] }
    }
  },
}

const cardImpl = {
  listeners: [triggerListener, costListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B128_Plumber = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plumber',
    deck: 'B',
    number: 128,
    category: 'FARM_PLANNER',
    desc: [
        'Each time after you use the __Major Improvement__ action space, you can take a __Renovation__ action, paying 2 <CLAY> or 2 <STONE> less for the renovation.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B128_Plumber_impl = B128_Plumber.impl
