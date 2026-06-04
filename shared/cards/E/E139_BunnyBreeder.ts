import { defineOccupationCard } from '../card-source'
/**
 * E139 Bunny Breeder — On buy, choose a single future round n+i (1 <= i <=
 * 14 - n). Place i food on that round's space; at the start of that round,
 * the player gains the food. XOR optional: player may decline.
 */

import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E139_BunnyBreeder'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const turnsLeft = 14 - state.round
      if (turnsLeft <= 0) return

      // Engine XOR child execution path: each child carries an inline
      // FutureMeepleRequest in params; futureMeeplesAction.execute reads the
      // request and queues + resolves it. Only the chosen child executes.
      const children: ActionFlow[] = []
      for (let i = 1; i <= turnsLeft; i += 1) {
        children.push(
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: player.id,
            entries: [{ round: state.round + i, resources: { food: i } }],
          }),
        )
      }
      return {
        type: 'xor',
        optional: true,
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E139_BunnyBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bunny Breeder',
    deck: 'E',
    number: 139,
    category: 'FOOD',
    desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
    players: '3+',
  },
  impl: cardImpl,
})

export const E139_BunnyBreeder_impl = E139_BunnyBreeder.impl
