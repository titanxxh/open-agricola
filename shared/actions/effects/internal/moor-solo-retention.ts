import type { ActionChoiceOption, ActionDefinition, GameState, PlayerState } from '../../../contract/types'
import { discardSoloMoorCurrent, soloMoorCurrent } from '../../../moor/solo-supply'

const options = (state: GameState, player: PlayerState): ActionChoiceOption[] => [
  { value: 'retain', labelKey: 'moor.solo.retain', disabled: state.farmersOfTheMoor?.soloRetentionPaid === true || player.resources.food < 2,
    effectPreview: { kind: 'payment', resourcesPaid: { food: 2 } } },
  { value: 'discard', labelKey: 'moor.solo.discard' },
]

export const moorSoloRetentionAction: ActionDefinition = {
  id: 'moor-solo-retention', nameKey: 'actions.pay.name', descriptionKey: 'actions.pay.description',
  roundAvailable: 1, gainPerRound: {}, skipChoiceWrap: true, canBeExecutedByPlayer: () => true,
  projectInteractionRequest: (state, player, request) => request.kind === 'choice' && request.moorSolo?.window === 'retention'
    ? { ...request, options: options(state, player) } : request,
  execute: ({ state, player, params }) => {
    const current = soloMoorCurrent(state)
    if (!current || current.id !== params?.cardId || current.location.kind !== 'solo-current' || !current.location.inUse) return { type: 'fail', errorKey: 'special action unavailable' }
    if (state.farmersOfTheMoor!.soloRetentionPaid) {
      discardSoloMoorCurrent(state, current.id)
      return { type: 'ok' }
    }
    return { type: 'request', request: { kind: 'choice', requiresExplicitChoice: true,
      moorSolo: { window: 'retention', currentCardId: current.id }, options: options(state, player) }, promptKey: 'ui.interactionFlowSelect' }
  },
  resolveChoice: ({ state, player, params, eventSink }, value) => {
    const current = soloMoorCurrent(state)
    if (!current || current.id !== params?.cardId || current.location.kind !== 'solo-current' || !current.location.inUse || state.farmersOfTheMoor!.soloRetentionPaid ||
        value !== 'retain' && value !== 'discard' || value === 'retain' && player.resources.food < 2) return { type: 'fail', errorKey: 'special action unavailable', recoverable: true }
    if (value === 'discard') discardSoloMoorCurrent(state, current.id)
    else {
      player.resources.food -= 2
      state.farmersOfTheMoor!.soloRetentionPaid = true
      current.location = { kind: 'solo-current' }
      eventSink?.emit<'resource.paid'>({ type: 'resource.paid', actorPlayerId: player.id,
        sourceActionId: 'moor-solo-retention', resources: { food: 2 }, to: { kind: 'supply' }, paymentFor: 'moor-retention' })
    }
    return { type: 'ok' }
  },
}
