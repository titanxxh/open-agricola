import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'A18_WheelPlow'

const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

// A18 Wheel Plow: Once this game, when you use the Farmland or Cultivation action space with the
// first person you place in a round, you can plow 2 additional fields.
const listener: CardListenerRegistration = {
  id: 'A18-wheel-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    // Must be the first person placed this round (placement count is 1 after placing)
    if (getRoundPlacementOrder(context.player).length !== 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          {
            type: 'seq',
            optional: true,
            children: [
              { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              {
                type: 'seq',
                optional: true,
                children: [
                  { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
                ],
              },
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A18_WheelPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Wheel Plow',
  deck: 'A',
  number: 18,
  category: 'FARM_PLANNER',
  desc: ['Once this game, when you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 2 additional fields.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
