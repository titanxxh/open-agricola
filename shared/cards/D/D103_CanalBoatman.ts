import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D103_CanalBoatman'
const TRIGGER_SPACE_IDS = new Set(['fishing', 'reed-bank'])

const listener: CardListenerRegistration = {
  id: 'D103-canal-boatman-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space || !TRIGGER_SPACE_IDS.has(context.space.id)) return
    if (context.player.workersAvailable <= 0) return
    if (context.player.resources.food < 1) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'spend-worker', sourceCard: CARD_ID },
          {
            type: 'xor',
            children: [
              gainLeaf(
                CARD_ID,
                { stone: 3 },
                'ui.interactionResourceExchange',
                { resourcesGained: { stone: 3 } },
              ),
              gainLeaf(
                CARD_ID,
                { grain: 1, vegetable: 1 },
                'ui.interactionResourceExchange',
                { resourcesGained: { grain: 1, vegetable: 1 } },
              ),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D103_CanalBoatman = new Occupation({
  id: CARD_ID,
  name: 'Canal Boatman',
  deck: 'D',
  number: 103,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time you use __Fishing__ or __Reed Bank__, you can pay 1 <FOOD> to immediately place another person on this card. If you do, you get your choice of 3 <STONE> or 1 <GRAIN> plus 1 <VEGETABLE>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
