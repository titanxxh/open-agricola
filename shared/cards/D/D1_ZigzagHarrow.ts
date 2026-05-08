import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { D1_ZigzagHarrow } from '../../cards-display/D/D1_ZigzagHarrow'
export { D1_ZigzagHarrow }

const CARD_ID = D1_ZigzagHarrow.id

registerPrerequisite('3 Fields in an "L" Shape', (player) => player.fields.length >= 2)

export const D1_ZigzagHarrow_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'plow',
      sourceCard: CARD_ID,
      optional: true,
      // TODO: restrict to zigzag-completing field locations (requires
      //   board-geometry helper + plow-validation actionContext threading;
      //   tracked as Sprint 7a deferred — see comment above).
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
