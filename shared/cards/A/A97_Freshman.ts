import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'A97_Freshman'

const computeReplaceListener: CardListenerRegistration = {
  id: 'A97-freshman-replace-bake',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        optional: true,
        promptKey: 'ui.interactionFreshmanOccupation',
        children: [
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'mark-card-trigger', sourceCard: CARD_ID },
          {
            type: 'leaf',
            actionId: 'play-occupation',
            sourceCard: CARD_ID,
            params: { costOverride: {} } as any,
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
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID },
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
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.occupationHand.length <= 0) return
    return { doable: true }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(afterPlaceFarmerListener)
registerCardListener(isDoableBakeListener)

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
