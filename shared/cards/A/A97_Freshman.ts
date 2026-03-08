import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter, initCardState } from '../__stubs__/helpers'

const CARD_ID = 'A97_Freshman'

const computeReplaceListener: CardListenerRegistration = {
  id: 'A97-freshman-replace-bake',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    if (counters['usedThisTurn']) return
    counters['usedThisTurn'] = 1
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      decline: true,
      alternativeFlow: { type: 'leaf', actionId: 'play-occupation', optional: true, promptKey: 'ui.interactionFreshmanOccupation' },
    }
  },
}

registerCardListener(computeReplaceListener)

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
