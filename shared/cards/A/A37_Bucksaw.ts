import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A37_Bucksaw'

const storePendingChoice = (
  player: import('../../game/types').PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { options, promptKey, targetCardId: CARD_ID }
}

const afterRenovateListener: CardListenerRegistration = {
  id: 'A37-bucksaw-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.player.resources.wood < 1) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    storePendingChoice(context.player, [
      { value: 'pay', labelKey: 'ui.interactionBucksawPay' },
      { value: 'skip', labelKey: 'ui.interactionBucksawSkip' },
    ], 'ui.interactionBucksawPrompt')
    return {
      flow: { type: 'leaf', actionId: 'card-choice' },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const processChoiceListener: CardListenerRegistration = {
  id: 'A37-bucksaw-process-choice',
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
      context.player.resources.wood -= 1
      incCounter(context.player, CARD_ID, 'bonusVp')
      return {
        flow: { type: 'leaf', actionId: 'gain', params: { grain: 1 } },
        logKey: 'log.cardEffectGain',
        logParams: { gain: { grain: 1 }, cardId: CARD_ID },
        sourceCard: CARD_ID,
      }
    }
  },
}

registerCardListener(afterRenovateListener)
registerCardListener(processChoiceListener)

export const A37_Bucksaw = new MinorImprovement({
  id: CARD_ID,
  name: "Bucksaw",
  deck: "A",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["Each time you renovate, you can also pay 1 <WOOD> to get 1 bonus <SCORE> and 1 <GRAIN>."],
  cost: {"wood":1},
  newSet: true,
})
