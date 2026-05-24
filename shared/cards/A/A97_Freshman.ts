import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A97_Freshman } from '../../cards-display/A/A97_Freshman'

const CARD_ID = A97_Freshman.id

const computeReplaceListener: CardListenerRegistration = {
  id: 'A97-freshman-replace-bake',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        optional: true,
        promptKey: 'ui.interactionFreshmanOccupation',
        choiceLabelKey: 'ui.interactionFreshmanOccupation',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            params: { costOverride: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'A97-freshman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableBakeListener: CardListenerRegistration = {
  id: 'A97-freshman-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.occupationHand.length <= 0) return
    return { doable: true }
  },
}

export const A97_Freshman_impl = {
  listeners: [computeReplaceListener, afterPlaceFarmerListener, isDoableBakeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
