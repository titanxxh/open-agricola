import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B131_Equipper'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// B131 Equipper: Immediately after each time you use a wood accumulation space, you can
// play a minor improvement.
// BGA: wrapOptional([IMPROVEMENT, types => [MINOR], trueAction => false])
const listener: CardListenerRegistration = {
  id: 'B131-equipper-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'minor-improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B131_Equipper = new Occupation({
  id: CARD_ID,
  name: 'Equipper',
  deck: 'B',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['Immediately after each time you use a wood accumulation space, you can play a minor improvement.'],
  cost: {},
  players: '3+',
  newSet: true,
})
