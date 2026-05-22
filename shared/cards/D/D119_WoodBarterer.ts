import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D119_WoodBarterer } from '../../cards-display/D/D119_WoodBarterer'

const CARD_ID = D119_WoodBarterer.id

const beforeListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-before-fence-construct',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionWoodBartererPrompt',
        children: [
          gainLeaf(CARD_ID, { wood: 2 }),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 1 },
            gain: { reed: 1 },
          }),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 2 },
            gain: { reed: 2 },
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (context.trueAction === false) return
    return { doable: true }
  },
}

export const D119_WoodBarterer_impl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
