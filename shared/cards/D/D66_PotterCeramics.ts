import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D66_PotterCeramics } from '../../cards-display/D/D66_PotterCeramics'
import { getPlayerBakeRates } from '../helpers/exchange-registry'

const CARD_ID = D66_PotterCeramics.id

/**
 * Before bake-bread: exchange 1 clay for 1 grain. Trigger-select handles
 * optionality and disables this option while the exchange is unaffordable.
 */
const beforeBakeListener: CardListenerRegistration = {
  id: 'D66-potter-ceramics-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  dispatchMode: 'select',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getPlayerBakeRates(context.player).length === 0) return
    return {
      flow: {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
          gainLeaf(CARD_ID, { grain: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * isDoable: if player has clay and can bake (after gaining grain), bake-bread is doable.
 */
const isDoableListener: CardListenerRegistration = {
  id: 'D66-potter-ceramics-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if ((context.player.resources.clay ?? 0) < 1) return
    if (getPlayerBakeRates(context.player).length > 0) {
      return { doable: true }
    }
  },
}

export const D66_PotterCeramics_impl = {
  listeners: [beforeBakeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
