import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D14_HammerCrusher'

const listener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-before-renovate',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { clay: 2, reed: 1 }),
          { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.interactionHammerCrusherBuild' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-isdoable-renovate',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.doable) return
    if (context.player.houseType !== 'clay') return
    // With 2 clay + 1 reed from this card, stone renovation becomes possible
    return { doable: true }
  },
}

registerCardListener(listener)
registerCardListener(isDoableListener)

export const D14_HammerCrusher = new MinorImprovement({
  id: CARD_ID,
  name: "Hammer Crusher",
  deck: "D",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Immediately before you renovate to stone, you get 2 <CLAY> and 1 <REED> and you can take a __Build Rooms__ action."],
  cost: {"wood":1},
})
