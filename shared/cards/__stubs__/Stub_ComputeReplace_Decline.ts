import type { CardListenerRegistration } from '../card-listeners'

export const CARD_ID = 'Stub_ComputeReplace_Decline'

export const listener: CardListenerRegistration = {
  id: 'stub-compute-replace-decline',
  cardIds: [CARD_ID],
  phases: ['computeReplace'],
  actions: ['sow'],
  handler: (context) => {
    if (context.actionContext?.checkedReplaceAction === true) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: CARD_ID,
        choiceLabelKey: 'actions.gain.name',
      },
    }
  },
}
