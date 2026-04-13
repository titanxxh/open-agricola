import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E75_StoneAxe'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'E75-stone-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { stone: 1 } }),
          gainLeaf(CARD_ID, { wood: 3 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E75_StoneAxe = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Axe",
  deck: "E",
  number: 75,
  desc: ["Each time you use a wood accumulation space, you can return 1 <STONE> to the general supply to get an additional 3 <WOOD>."],
  cost: { wood: 1, clay: 1 },
  vp: 1,
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
