import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'D119_WoodBarterer'

const storePendingChoice = (
  player: import('../../game/types').PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { options, promptKey, targetCardId: CARD_ID }
}

const beforeListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-before-fence-construct',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    storePendingChoice(context.player, [
      { value: 'wood2', labelKey: 'ui.interactionWoodBarterer2Wood' },
      { value: 'trade1', labelKey: 'ui.interactionWoodBartererTrade1' },
      { value: 'trade2', labelKey: 'ui.interactionWoodBartererTrade2' },
      { value: 'skip', labelKey: 'ui.interactionWoodBartererSkip' },
    ], 'ui.interactionWoodBartererPrompt')
    return {
      flow: { type: 'leaf', actionId: 'card-choice' },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const processChoiceListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-process-choice',
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

    if (pending.choiceResult === 'wood2') {
      return {
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 2 } },
        logKey: 'log.cardEffectGain',
        logParams: { gain: { wood: 2 }, cardId: CARD_ID },
      }
    }
    if (pending.choiceResult === 'trade1') {
      if (context.player.resources.wood >= 1) {
        context.player.resources.wood -= 1
        return {
          flow: { type: 'leaf', actionId: 'gain', params: { reed: 1 } },
          logKey: 'log.cardEffectGain',
          logParams: { gain: { reed: 1 }, cardId: CARD_ID },
        }
      }
    }
    if (pending.choiceResult === 'trade2') {
      if (context.player.resources.wood >= 2) {
        context.player.resources.wood -= 2
        return {
          flow: { type: 'leaf', actionId: 'gain', params: { reed: 2 } },
          logKey: 'log.cardEffectGain',
          logParams: { gain: { reed: 2 }, cardId: CARD_ID },
        }
      }
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    // The card can provide 2 wood, which may make fence/construct affordable
    if (!context.doable) {
      return { doable: true }
    }
  },
}

registerCardListener(beforeListener)
registerCardListener(processChoiceListener)
registerCardListener(isDoableListener)

export const D119_WoodBarterer = new Occupation({
  id: CARD_ID,
  name: "Wood Barterer",
  deck: "D",
  number: 119,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you use an action space with a __Build Fences__ or __Build Rooms__ action, you can choose to either get 2 <WOOD> or exchange up to 2 <WOOD> for 1 <REED> each."],
  cost: {},
  players: "1+",
})
