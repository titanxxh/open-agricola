import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A15_CarpentersAxe'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// A15 Carpenter's Axe: After using a wood accumulation space, if you then have at least 7 wood,
// you can build exactly 1 stable for 1 wood.
const listener: CardListenerRegistration = {
  id: 'A15-carpenters-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!isWoodAccumulationSpace(context.space)) return
    if ((context.player.resources.wood ?? 0) < 7) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costOverride: { wood: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A15_CarpentersAxe = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Axe",
  deck: 'A',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ["Each time after you use a wood accumulation space, if you then have at least 7 <WOOD> in your supply, you can build exactly 1 stable for 1 <WOOD>."],
  cost: { wood: 1 },
  newSet: true,
})
