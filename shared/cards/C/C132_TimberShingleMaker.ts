import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'C132_TimberShingleMaker'

/**
 * C132 Timber Shingle Maker:
 * When you renovate to stone, you can place up to 1 WOOD from your supply in each
 * of your rooms. During scoring, each such WOOD is worth 1 bonus VP.
 *
 * BGA: After renovation, if roomStone, offer XOR choices: pay 1..N wood for 1..N VP.
 * We present XOR options to pay 1..rooms wood, and grant bonus VP per wood paid.
 * Track wood placed via counter for computeBonusScore.
 */
registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.cardStates?.[CARD_ID]?.counters?.woodPlaced ?? 0
  },
})

const afterRenovateListener: CardListenerRegistration = {
  id: 'C132-timber-shingle-maker-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only triggers when renovating to stone
    if (context.player.houseType !== 'stone') return
    const rooms = context.player.rooms
    if (rooms <= 0) return
    if (context.player.resources.wood < 1) return

    // XOR: pay 1 wood for 1 VP, pay 2 wood for 2 VP, ... pay N wood for N VP
    const maxWood = Math.min(rooms, context.player.resources.wood)
    const children: ActionFlow[] = []
    for (let i = 1; i <= maxWood; i++) {
      children.push({
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: i } }),
          ...Array.from({ length: i }, () => ({
            type: 'leaf' as const,
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          })),
        ],
      })
    }

    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterRenovateListener)

export const C132_TimberShingleMaker = new Occupation({
  id: CARD_ID,
  name: 'Timber Shingle Maker',
  deck: 'C',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: [
    'When you renovate to stone, you can place up to 1 <WOOD> from your supply in each of your rooms. During scoring, each such <WOOD> is worth 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '3+',
  extraVp: true,
  evenMoreSet: true,
})
