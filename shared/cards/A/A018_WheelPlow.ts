import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPersonPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'A018_WheelPlow'
const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'A18-wheel-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    // Must be the first person placed this round (placement count is 1 after placing)
    if (getRoundPersonPlacementOrder(context.player).length !== 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A018_WheelPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wheel Plow',
    deck: 'A',
    number: 18,
    category: 'FARM_PLANNER',
    desc: ['Once this game, when you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 2 additional <FIELD>.'],
    cost: { wood: 2 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const A018_WheelPlow_impl = A018_WheelPlow.impl
