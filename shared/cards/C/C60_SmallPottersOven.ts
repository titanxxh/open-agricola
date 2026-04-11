import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'
import { getMajorCardEffect } from '../major'
import { canAffordCost } from '../../actions/effects/pay-helpers'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C60_SmallPottersOven'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

const getAvailableOvenChoices = (context: CardListenerContext) =>
  OVEN_IDS.filter((id) => {
    if (!context.state.availableMajorImprovements.includes(id)) return false
    const effect = getMajorCardEffect(id)
    if (!effect?.cost) return false
    return canAffordCost(context.player, effect.cost)
  })

const beforeBakeListener: CardListenerRegistration = {
  id: 'C60-small-potters-oven-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const allowedPurchases = getAvailableOvenChoices(context)
    if (allowedPurchases.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        promptKey: 'ui.interactionSmallPottersOvenBuild',
        sourceCard: CARD_ID,
        params: {
          allowedPurchases,
          suppressOnBuyEffects: true,
        } as unknown as Partial<Resource>,
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'C60-small-potters-oven-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (getAvailableOvenChoices(context).length > 0) {
      return { doable: true }
    }
  },
}

registerCardListener(beforeBakeListener)
registerCardListener(isDoableListener)

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player, paymentInfo) => {
    if (!paymentInfo?.returnedCardId) return
    if (!OVEN_IDS.includes(paymentInfo.returnedCardId as (typeof OVEN_IDS)[number])) {
      return
    }
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: 5 })],
    }
  },
})

export const C60_SmallPottersOven = new MinorImprovement({
  id: CARD_ID,
  name: "Small Potter's Oven",
  deck: "C",
  number: 60,
  category: "FOOD_PROVIDER",
  desc: [
    "When you play this card, you immediately get 5 <FOOD>. Each time before you get a __Bake Bread__ action, you can build the __Clay Oven__ or __Stone Oven__ major improvement.",
  ],
  vp: 5,
  cost: { clay: 2 },
  prerequisite: "Return the Clay / Stone Oven",
  returnCards: ['Major_ClayOven', 'Major_StoneOven'],
})
