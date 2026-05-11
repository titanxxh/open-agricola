import type { CardImpl } from '../registry'
import { C6_StoneClearing } from '../../cards-display/C/C6_StoneClearing'

const CARD_ID = C6_StoneClearing.id

export const C6_StoneClearing_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      for (const f of player.fields) {
        if (f.stacks.length === 0) {
          f.stacks.push({ kind: 'stone', remaining: 1 })
        }
      }
      // No leaf returned — stone is granted by reap main path next harvest.
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
