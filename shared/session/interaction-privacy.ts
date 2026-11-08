import type { InteractionState } from '../contract/types'
import type { PrivateGameEvent } from '../contract/protocol/game'
import { interactionRecipientPlayerId } from './interaction-state-adapter'

const PRIVATE_EVENT_PROMPT_KINDS = new Set(['resource-batch-exchange-select'])

export const privateEventsForViewer = (
  interaction: InteractionState,
  playerIds: readonly string[],
  visiblePlayerIds: readonly string[],
  responsePrivateEvents: PrivateGameEvent[] = [],
): PrivateGameEvent[] => {
  if (visiblePlayerIds.length === 0) return []
  const events: PrivateGameEvent[] = []
  if (interaction.stateId === 'wait' && PRIVATE_EVENT_PROMPT_KINDS.has(interaction.request.kind)) {
    const recipient = interactionRecipientPlayerId(interaction, playerIds)
    if (recipient !== null && visiblePlayerIds.includes(recipient)) {
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
  events.push(...responsePrivateEvents.filter((event) => visiblePlayerIds.includes(event.recipientPlayerId)))
  return events
}
