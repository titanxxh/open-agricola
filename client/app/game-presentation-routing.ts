import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { InteractionRequest } from '../../shared/contract/types'

export type GamePresentation = 'action' | 'farm' | 'cards' | 'information'

const PRESENTATION_BY_REQUEST_KIND = {
  choice: 'action',
  'animal-reorg': 'farm',
  'confirm-next-player': null,
  'confirm-player-switch': null,
  feed: 'farm',
  heating: 'farm',
  'farm-select': 'farm',
  selection: 'farm',
  'card-draft': 'cards',
  'select-trigger': 'action',
  'engine-blocked': null,
  'resource-quantity-select': null,
  'resource-batch-exchange-select': null,
} satisfies Record<InteractionRequest['kind'], GamePresentation | null>

export const mobilePresentationForInteraction = (
  interaction: ClientInteractionState,
): GamePresentation | null => {
  if (interaction.stateId !== 'wait' || interaction.request.kind === 'private-prompt') return null
  if (
    interaction.request.kind === 'selection' &&
    interaction.request.selection.kind === 'occupation-hand'
  ) {
    return 'cards'
  }
  return PRESENTATION_BY_REQUEST_KIND[interaction.request.kind]
}

export const mobilePresentationRoute = (
  interaction: ClientInteractionState,
  historyLength: number,
): { key: string; presentation: GamePresentation } | null => {
  const presentation = mobilePresentationForInteraction(interaction)
  if (
    presentation === null ||
    interaction.stateId !== 'wait' ||
    interaction.request.kind === 'private-prompt'
  ) {
    return null
  }
  return {
    key: JSON.stringify([
      historyLength,
      interaction.playerIndex,
      interaction.request.kind,
      presentation,
      interaction.spaceId ?? null,
      interaction.promptKey ?? null,
    ]),
    presentation,
  }
}
