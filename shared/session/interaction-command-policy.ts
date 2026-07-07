import type { InteractionCommand, InteractionRequest } from '../contract/types'

export type InteractionSubmitChannel = 'resolveChoice' | 'commitSelection' | 'none'

export const interactionSubmitChannel = (
  kind: InteractionRequest['kind'],
): InteractionSubmitChannel => {
  switch (kind) {
    case 'farm-select':
    case 'selection':
    case 'resource-quantity-select':
    case 'resource-batch-exchange-select':
      return 'commitSelection'
    case 'card-draft':
    case 'engine-blocked':
      return 'none'
    default:
      return 'resolveChoice'
  }
}

export const waitInteractionInputCommands = (
  kind: InteractionRequest['kind'],
): InteractionCommand[] => {
  const channel = interactionSubmitChannel(kind)
  return channel === 'none' ? [] : [channel]
}

export const waitInteractionCommandsWithUndo = (
  kind: InteractionRequest['kind'],
  options: { includeAnytimeAction?: boolean } = {},
): InteractionCommand[] => {
  const commands: InteractionCommand[] = [
    ...waitInteractionInputCommands(kind),
    'undoStep',
    'undoAction',
  ]
  if (options.includeAnytimeAction) commands.push('takeAnytimeAction')
  return commands
}
