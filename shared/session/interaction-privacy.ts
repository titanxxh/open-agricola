import type { InteractionState } from '../contract/types'
import type { ClientInteractionState, PrivateGameEvent } from '../contract/protocol/game'

const PRIVATE_EVENT_PROMPT_KINDS = new Set(['resource-batch-exchange-select'])

const targetPlayerId = (
  interaction: InteractionState,
  playerIds: readonly string[],
): string | null =>
  interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number'
    ? playerIds[interaction.playerIndex] ?? null
    : null

export const filterInteractionForViewer = (
  interaction: InteractionState,
  playerIds: readonly string[],
  viewerPlayerId: string | null,
): ClientInteractionState => {
  if (interaction.stateId !== 'wait') return interaction
  const recipient = targetPlayerId(interaction, playerIds)
  if (recipient !== null && recipient === viewerPlayerId) return interaction
  if (recipient === null) return interaction
  return {
    stateId: 'wait',
    playerIndex: interaction.playerIndex,
    sourceCard: interaction.sourceCard,
    promptKey: interaction.promptKey,
    request: {
      kind: 'private-prompt',
      playerIndex: interaction.playerIndex,
      promptKind: interaction.request.kind,
      sourceCard: interaction.sourceCard,
      promptKey: interaction.promptKey,
    },
    allowedCommands: [],
    anytimeActions: [],
  }
}

export const privateEventsForViewer = (
  interaction: InteractionState,
  playerIds: readonly string[],
  viewerPlayerId: string | null,
  responsePrivateEvents: PrivateGameEvent[] = [],
): PrivateGameEvent[] => {
  if (viewerPlayerId === null) return []
  const events: PrivateGameEvent[] = []
  if (interaction.stateId === 'wait' && PRIVATE_EVENT_PROMPT_KINDS.has(interaction.request.kind)) {
    const recipient = targetPlayerId(interaction, playerIds)
    if (recipient !== null && recipient === viewerPlayerId) {
      events.push({
        schemaVersion: 1,
        type: 'private.promptShown',
        recipientPlayerId: recipient,
        promptKind: interaction.request.kind,
        sourceCard: interaction.sourceCard,
        promptKey: interaction.promptKey,
      })
    }
  }
  events.push(...responsePrivateEvents.filter((event) => event.recipientPlayerId === viewerPlayerId))
  return events
}
