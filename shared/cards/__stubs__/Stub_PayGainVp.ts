import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { incCounter, initCardState } from './helpers'
import type { ActionChoiceOption } from '../../game/types'

export const CARD_ID = 'Stub_PayGainVp'

const storePendingChoice = (
  player: import('../../game/types').PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { options, promptKey, targetCardId: CARD_ID }
}

export const afterListener: CardListenerRegistration = {
  id: 'stub-pay-gain-vp-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['renovate-house'],
  handler: (context): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.player.resources.wood < 1) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    storePendingChoice(context.player, [
      { value: 'pay', labelKey: 'ui.stubPayGainVpPay' },
      { value: 'skip', labelKey: 'ui.stubPayGainVpSkip' },
    ], 'ui.stubPayGainVpPrompt')
    return {
      flow: { type: 'leaf', actionId: 'card-choice' },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

export const choiceListener: CardListenerRegistration = {
  id: 'stub-pay-gain-vp-process-choice',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['card-choice'],
  handler: (context): ActionHookResult | void => {
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
