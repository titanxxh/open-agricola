import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { buildSelectableMajorIds, buildSelectableMinorIds } from './game-container-helpers'
import { interactionChoiceOptions, isDomainWaitInteraction } from './interaction-presentation'
import { interactionFocusRequestKey } from './interaction-focus'

export const getImprovementSelection = (
  interaction: ClientInteractionState,
  minorHand: readonly string[],
  availableMajorIds: readonly string[],
) => {
  if (!isDomainWaitInteraction(interaction) || interaction.request.kind !== 'choice' ||
    (interaction.promptKey !== 'ui.interactionChooseImprovement' && interaction.promptKey !== 'ui.interactionChooseMinorImprovement')) return null
  const options = interactionChoiceOptions(interaction).filter(option => !option.disabled)
  const hand = new Set(minorHand)
  const minorIds = new Set([...buildSelectableMinorIds(options)].filter(id => hand.has(id)))
  const majorIds = buildSelectableMajorIds(options, availableMajorIds)
  const target: 'minor-hand' | 'major-supply' | 'controls' = minorIds.size > 0
    ? 'minor-hand' : majorIds.size > 0 ? 'major-supply' : 'controls'
  return { requestKey: interactionFocusRequestKey(interaction), minorIds, majorIds, target }
}
