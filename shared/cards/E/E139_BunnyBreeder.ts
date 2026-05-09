import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E139_BunnyBreeder } from '../../cards-display/E/E139_BunnyBreeder'

const CARD_ID = E139_BunnyBreeder.id

export const E139_BunnyBreeder_impl = {
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
