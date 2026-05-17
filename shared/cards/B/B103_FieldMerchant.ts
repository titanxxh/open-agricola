import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B103_FieldMerchant } from '../../cards-display/B/B103_FieldMerchant'

const CARD_ID = B103_FieldMerchant.id

const computeReplaceListener: CardListenerRegistration = {
  id: 'B103-field-merchant-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (context.actionContext?.checkedReplaceAction) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        choiceLabelKey: 'ui.interactionFieldMerchantChoose',
        children: [
          {
            type: 'xor',
            promptKey: 'ui.interactionFieldMerchantChoose',
            children: [
              { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'gain', params: { vegetable: 1 }, sourceCard: CARD_ID },
            ],
          },
        ],
      },
    }
  },
}

const onPlayListener: CardListenerRegistration = {
  id: 'B103-field-merchant-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { wood: 1, reed: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B103-field-merchant-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    return { doable: true }
  },
}

export const B103_FieldMerchant_impl = {
  listeners: [computeReplaceListener, onPlayListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
