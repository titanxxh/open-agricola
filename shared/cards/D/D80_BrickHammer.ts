import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPrintedImprovementResourceCost } from '../../actions/helpers/improvement-helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'D80_BrickHammer'
const listener: CardListenerRegistration = {
  id: 'D80-brick-hammer-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!readImprovementTypes(context).includes('major')) return
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId) return
    if (getPrintedImprovementResourceCost(builtId, 'clay') < 2) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D80_BrickHammer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Brick Hammer',
    deck: 'D',
    number: 80,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time after you build an improvement costing at least 2 <CLAY>, you get 1 <STONE>.'],
    altCosts: [{ wood: 1 }, { food: 1 }],
  },
  impl: cardImpl,
})

export const D80_BrickHammer_impl = D80_BrickHammer.impl
