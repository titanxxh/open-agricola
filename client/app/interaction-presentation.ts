import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { InteractionState } from '../../shared/contract/types'
import type { PendingChoice } from '../types/ui'
import {
  buildPendingMoorSpecialActionChoiceMaps,
  type PendingMoorSpecialActionChoiceMaps,
} from './game-container-helpers'

type WaitInteraction = Extract<InteractionState, { stateId: 'wait' }>

export type InteractionPresentationPlan =
  | { kind: 'none' }
  | {
      kind: 'choice-bar'
      pendingChoice: PendingChoice
      suppressChoiceOptions: boolean
    }
  | {
      kind: 'exchange-center'
      pendingChoice: PendingChoice
    }
  | {
      kind: 'moor-special-action'
      pendingChoice: PendingChoice
      choices: PendingMoorSpecialActionChoiceMaps
      suppressChoiceOptions: true
    }

const choiceOptions = (interaction: WaitInteraction) =>
  interaction.options ?? (
    (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
      ? interaction.request.options
      : []
  )

const pendingChoiceFromInteraction = (interaction: WaitInteraction): PendingChoice => ({
  promptKey: interaction.promptKey,
  promptParams: interaction.promptParams,
  options: choiceOptions(interaction),
  playerIndex: interaction.playerIndex,
  spaceId: interaction.spaceId ?? '',
  sourceCard: interaction.sourceCard,
  fenceExtraWood:
    interaction.farm?.farmType === 'fence'
      ? interaction.farm.extraWood ?? 0
      : undefined,
})

const isChoiceSurfaceInteraction = (
  interaction: ClientInteractionState,
): interaction is WaitInteraction => (
  interaction.stateId === 'wait' &&
  (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
)

export const buildInteractionPresentationPlan = (
  interaction: ClientInteractionState,
): InteractionPresentationPlan => {
  if (!isChoiceSurfaceInteraction(interaction)) return { kind: 'none' }

  const pendingChoice = pendingChoiceFromInteraction(interaction)
  const moorChoices = buildPendingMoorSpecialActionChoiceMaps(pendingChoice.options)
  if (moorChoices.isActive) {
    return {
      kind: 'moor-special-action',
      pendingChoice,
      choices: moorChoices,
      suppressChoiceOptions: true,
    }
  }
  if (pendingChoice.promptKey === 'ui.interactionExchangeChoice') {
    return { kind: 'exchange-center', pendingChoice }
  }
  return {
    kind: 'choice-bar',
    pendingChoice,
    suppressChoiceOptions: false,
  }
}
