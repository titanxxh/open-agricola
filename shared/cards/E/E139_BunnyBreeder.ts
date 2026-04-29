import { Occupation } from '../types'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E139_BunnyBreeder'

export const E139_BunnyBreeder = new Occupation({
  id: CARD_ID,
  name: 'Bunny Breeder',
  deck: 'E',
  number: 139,
  category: 'FOOD',
  desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
  players: '3+',
})

export const E139_BunnyBreeder_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
