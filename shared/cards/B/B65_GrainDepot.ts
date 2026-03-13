import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { incCounter } from '../__stubs__/helpers'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'B65_GrainDepot'

const storePendingChoice = (
  player: import('../../game/types').PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { options, promptKey, targetCardId: CARD_ID }
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return

    const options: ActionChoiceOption[] = []
    if (player.resources.wood >= 2) {
      options.push({ value: 'wood', labelKey: 'ui.interactionGrainDepotWood' })
    }
    if (player.resources.clay >= 2) {
      options.push({ value: 'clay', labelKey: 'ui.interactionGrainDepotClay' })
    }
    if (player.resources.stone >= 2) {
      options.push({ value: 'stone', labelKey: 'ui.interactionGrainDepotStone' })
    }

    if (options.length === 0) return

    storePendingChoice(player, options, 'ui.interactionGrainDepotPrompt')
    return { type: 'leaf', actionId: 'card-choice' }
  },
})

const processChoiceListener: CardListenerRegistration = {
  id: 'B65-grain-depot-process-choice',
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

    let rounds = 0
    if (pending.choiceResult === 'wood' && context.player.resources.wood >= 2) {
      context.player.resources.wood -= 2
      rounds = 2
    } else if (pending.choiceResult === 'clay' && context.player.resources.clay >= 2) {
      context.player.resources.clay -= 2
      rounds = 3
    } else if (pending.choiceResult === 'stone' && context.player.resources.stone >= 2) {
      context.player.resources.stone -= 2
      rounds = 4
    }

    if (rounds > 0) {
      incCounter(context.player, CARD_ID, 'triggerCount')
      queueFutureMeeples(context.state, {
        cardId: CARD_ID,
        playerId: context.player.id,
        startRound: context.state.round + 1,
        count: rounds,
        resources: { grain: 1 },
      })
      return {
        flow: futureMeeplesNode(),
        logKey: 'log.cardEffectGain',
        logParams: { gain: { grain: rounds }, cardId: CARD_ID },
      }
    }
  },
}

registerCardListener(processChoiceListener)

export const B65_GrainDepot = new MinorImprovement({
  id: CARD_ID,
  name: "Grain Depot",
  deck: "B",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["If you paid <WOOD>/<CLAY>/<STONE> for this card, place 1 <GRAIN> on each of the next 2/3/4 round spaces. At the start of these rounds, you get the <GRAIN>."],
  cost: {},
})
