import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E139_BunnyBreeder'

// BGA: player selects a future round space; food placed = (selectedRound - currentRound).
// The BGA implementation queues future meeples based on the player's xor choice.
// In our engine, we can't dynamically queue after a choice, so we approximate:
// We pre-queue all possible future meeple amounts and offer the player an xor of direct gains.
// TODO: implement choice-based future meeple queueing so food is received at the future round
// (not immediately). Currently the player gains the food immediately as an approximation.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const turnsLeft = 14 - state.round
    if (turnsLeft <= 0) return

    const xorChildren: ActionFlow[] = []
    for (let i = 1; i <= turnsLeft; i++) {
      // Pre-queue future meeple and offer a corresponding gain node (approximation)
      xorChildren.push({
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { food: i },
        // TODO: should place i food on round targetRound space, not gain immediately
      })
    }

    return {
      type: 'xor' as const,
      optional: true,
      children: xorChildren,
    }
  },
})

export const E139_BunnyBreeder = new Occupation({
  id: CARD_ID,
  name: 'Bunny Breeder',
  deck: 'E',
  number: 139,
  category: 'FOOD_MISC',
  desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
  players: '3+',
})
