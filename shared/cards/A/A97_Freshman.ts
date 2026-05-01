import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A97_Freshman'

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
            actionId: 'play-occupation',
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

export const A97_Freshman = new Occupation({
  id: CARD_ID,
  name: "Freshman",
  deck: "A",
  number: 97,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you get a __Bake Bread__ action, instead of taking the action, you can play an occupation without paying an occupation cost (at most once per turn)."],
  cost: {},
  players: "1+",
})

export const A97_Freshman_impl = {
  listeners: [computeReplaceListener, afterPlaceFarmerListener, isDoableBakeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
