import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { ActionFlow } from '../../contract/types'
import { readImprovementTypes } from '../../actions/effects/improvement'

const CARD_ID = 'B103_FieldMerchant'
const computeReplaceListener: CardListenerRegistration = {
  id: 'B103-field-merchant-replace-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (context.actionContext?.checkedReplaceAction) return
    const types = readImprovementTypes(context)
    const alternatives: ActionFlow[] = []
    if (types.includes('minor')) alternatives.push(gainLeaf(CARD_ID, { food: 1 }))
    if (types.includes('major')) alternatives.push(gainLeaf(CARD_ID, { vegetable: 1 }))
    if (alternatives.length === 0) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'xor',
        promptKey: 'ui.interactionFieldMerchantChoose',
        children: alternatives,
      },
    }
  },
}

const onPlayListener: CardListenerRegistration = {
  id: 'B103-field-merchant-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
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
    if (context.doable || context.trueAction === false || context.actionContext?.checkedReplaceAction) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener, onPlayListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B103_FieldMerchant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Field Merchant",
    deck: "B",
    number: 103,
    category: "GOODS_PROVIDER",
    desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you decline a __Minor/Major Improvement__ action, you get 1 <FOOD>/<VEGETABLE> instead."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const B103_FieldMerchant_impl = B103_FieldMerchant.impl
