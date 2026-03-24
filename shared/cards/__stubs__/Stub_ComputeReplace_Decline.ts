import type { CardListenerRegistration } from '../card-listeners'

export const CARD_ID = 'Stub_ComputeReplace_Decline'

export const listener: CardListenerRegistration = {
  id: 'stub-compute-replace-decline',
  cardIds: [CARD_ID],
  phases: ['computeReplace'],
  actions: ['sow'],
  handler: (context) => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.actionContext?.checkedReplaceAction === true) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        choiceLabelKey: 'actions.gain.name',
        children: [
          { type: 'leaf', actionId: 'mark-card-trigger', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 1 } },
        ],
      },
    }
  },
}
