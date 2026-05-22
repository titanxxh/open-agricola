import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D14_HammerCrusher } from '../../cards-display/D/D14_HammerCrusher'

const CARD_ID = D14_HammerCrusher.id

const listener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-before-renovate',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { clay: 2, reed: 1 }),
          { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.interactionHammerCrusherBuild' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-isdoable-renovate',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (context.player.houseType !== 'clay') return
    // With 2 clay + 1 reed from this card, stone renovation becomes possible
    return { doable: true }
  },
}

export const D14_HammerCrusher_impl = {
  listeners: [listener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
