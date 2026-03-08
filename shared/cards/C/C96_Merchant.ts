import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'C96_Merchant'

const storePendingChoice = (
  player: import('../../game/types').PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { options, promptKey, targetCardId: CARD_ID }
}

const immediatelyAfterListener: CardListenerRegistration = {
  id: 'C96-merchant-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.resources.food < 1) return
    const activated = context.player.cardStates?.[CARD_ID]?.counters?.activatedThisTurn ?? 0
    if (activated > 0) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    storePendingChoice(context.player, [
      { value: 'pay', labelKey: 'ui.interactionMerchantPay' },
      { value: 'skip', labelKey: 'ui.interactionMerchantSkip' },
    ], 'ui.interactionMerchantPrompt')
    return {
      flow: { type: 'leaf', actionId: 'card-choice' },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const processChoiceListener: CardListenerRegistration = {
  id: 'C96-merchant-process-choice',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['card-choice'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const pending = context.player.cardStates?.__pendingChoice__?.extraData as {
      targetCardId?: string
      choiceResult?: string
    } | undefined
    if (pending?.targetCardId !== CARD_ID) return
    if (pending?.choiceResult === undefined) return

    if (context.player.cardStates?.__pendingChoice__?.extraData) {
      delete context.player.cardStates.__pendingChoice__.extraData
    }

    if (pending.choiceResult === 'pay') {
      context.player.resources.food -= 1
      incCounter(context.player, CARD_ID, 'activatedThisTurn')
      return {
        flow: { type: 'leaf', actionId: 'improvement-any' },
        logKey: 'log.cardGrantedAction',
        logParams: { cardId: CARD_ID, actionId: 'improvement-any' },
        sourceCard: CARD_ID,
      }
    }
  },
}

registerCardListener(immediatelyAfterListener)
registerCardListener(processChoiceListener)

export const C96_Merchant = new Occupation({
  id: CARD_ID,
  name: "Merchant",
  deck: "C",
  number: 96,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately after each time you take a __Major or Minor Improvement__ or __Minor Improvement__ action, you can pay 1 <FOOD> to take the action a second time."],
  cost: {},
  players: "1+",
})
