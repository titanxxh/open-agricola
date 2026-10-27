import type { ActionDefinition } from '../../../contract/types'
import { revealSoloMoorCurrent, soloMoorCurrent, soloMoorDraw } from '../../../moor/solo-supply'

export const moorSoloPreparationAction: ActionDefinition = {
  id: 'moor-solo-preparation', nameKey: 'actions.receive.name', descriptionKey: 'actions.receive.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  execute: ({ state, player, reportProtectedObservation }) => {
    if (state.players.length !== 1 || !state.farmersOfTheMoor) return { type: 'ok' }
    const current = soloMoorCurrent(state)
    if (!current) {
      if (revealSoloMoorCurrent(state)) {
        state.pendingUndoBoundary = true
        reportProtectedObservation?.({ kind: 'hidden-information', recipientPlayerIds: [player.id] })
      }
      return { type: 'ok' }
    }
    if (!soloMoorDraw(state).length) return { type: 'ok' }
    return { type: 'request', request: { kind: 'choice', requiresExplicitChoice: true,
      moorSolo: { window: 'preparation', currentCardId: current.id }, options: [
        { value: 'keep', labelKey: 'moor.solo.keepCurrent' },
        { value: 'replace', labelKey: 'moor.solo.replaceCurrent' },
      ] }, promptKey: 'ui.interactionFlowSelect' }
  },
  resolveChoice: ({ state, player, reportProtectedObservation }, value) => {
    const current = soloMoorCurrent(state)
    const draw = soloMoorDraw(state)
    if (!current || !draw.length || value !== 'keep' && value !== 'replace') return { type: 'fail', errorKey: 'special action unavailable', recoverable: true }
    if (value === 'replace') {
      current.location = { kind: 'solo-draw', order: Math.max(...draw.map(card => card.location.kind === 'solo-draw' ? card.location.order : 0)) + 1 }
      revealSoloMoorCurrent(state)
      state.pendingUndoBoundary = true
      reportProtectedObservation?.({ kind: 'hidden-information', recipientPlayerIds: [player.id] })
    }
    return { type: 'ok' }
  },
}
