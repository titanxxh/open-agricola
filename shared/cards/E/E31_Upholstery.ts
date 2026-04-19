import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E31_Upholstery'

// E31 Upholstery: Each time you build or play an improvement after this one, you can place
// 1 REED on this card, irretrievably, to get 1 bonus SCORE, up to the number of rooms in your house.
// Uses return-to-space (card storage) to track reed on card and bonus-vp for score.
const listener: CardListenerRegistration = {
  id: 'E31-upholstery-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    // Cap: number of rooms in house
    const roomCount = context.player.roomTiles.length
    if (roomCount <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { reed: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E31_Upholstery = new MinorImprovement({
  id: CARD_ID,
  name: 'Upholstery',
  deck: 'E',
  number: 31,
  category: 'BONUS_POINTS_GET',
  desc: [
    'Each time you build or play an improvement after this one, you can place 1 <REED> on this card, irretrievably, to get 1 bonus <SCORE>, up to the number of rooms in your house.',
  ],
  cost: {},
})
