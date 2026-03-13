import type { ActionChoiceOption, ActionDefinition } from '../../game/types'

export const cardChoiceAction: ActionDefinition = {
  id: 'card-choice',
  nameKey: 'actions.card-choice.name',
  descriptionKey: 'actions.card-choice.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const pendingChoice = player.cardStates?.__pendingChoice__?.extraData as {
      options?: ActionChoiceOption[]
      promptKey?: string
      targetCardId?: string
    } | undefined

    if (!pendingChoice?.options || pendingChoice.options.length === 0) {
      return { type: 'ok' }
    }

    return {
      type: 'choice',
      promptKey: pendingChoice.promptKey ?? 'ui.interactionChooseOne',
      options: pendingChoice.options,
    }
  },
  resolveChoice: ({ player }, choice) => {
    if (!player.cardStates) {
      player.cardStates = {}
    }
    if (!player.cardStates.__pendingChoice__) {
      player.cardStates.__pendingChoice__ = { counters: {} }
    }
    if (!player.cardStates.__pendingChoice__.extraData) {
      player.cardStates.__pendingChoice__.extraData = {}
    }

    const pendingChoice = player.cardStates.__pendingChoice__.extraData as {
      options?: ActionChoiceOption[]
      promptKey?: string
      targetCardId?: string
    }

    player.cardStates.__pendingChoice__.extraData = {
      ...pendingChoice,
      choiceResult: choice,
      choiceTimestamp: Date.now(),
    }

    return { type: 'ok' }
  },
}
