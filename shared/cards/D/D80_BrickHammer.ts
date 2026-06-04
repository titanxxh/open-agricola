import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPrintedImprovementResourceCost } from '../../actions/helpers/improvement-helpers'
import type { CardImpl } from '../registry'
import { D80_BrickHammer } from '../../cards-display/D/D80_BrickHammer'

const CARD_ID = D80_BrickHammer.id

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

export const D80_BrickHammer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
