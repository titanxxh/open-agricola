import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'D92_ChildOmbudsman'

const afterFamilyGrowthListener: CardListenerRegistration = {
  id: 'D92-child-ombudsman-after-family-growth',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children', 'wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.state.round < 5) return
    const count = (readCardExtraData<number>(context.player, CARD_ID, 'growthCount') ?? 0) + 1
    writeCardExtraData(context.player, CARD_ID, 'growthCount', count)
  },
}

registerCardListener(afterFamilyGrowthListener)

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    return -(readCardExtraData<number>(player, CARD_ID, 'growthCount') ?? 0) * 2
  },
})

export const D92_ChildOmbudsman = new Occupation({
  id: CARD_ID,
  name: "Child Ombudsman",
  deck: "D",
  number: 92,
  category: "ACTIONS_BOOSTER",
  desc: ["From round 5 on, if you have room in your house, at the end of each person action, you can take a __Family Growth__ action with that person. If you do, you get 2 negative <SCORE>."],
  cost: {},
  players: "1+",
})
