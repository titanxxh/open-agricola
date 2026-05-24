import type { ActionFlow } from '../../contract/types'
import {
  getOwnOrdinaryFenceCount,
  MAX_ORDINARY_FENCE_PIECES,
} from '../../domain/fence-segments'
import type { CardImpl } from '../registry'
import { C1_Overhaul } from '../../cards-display/C/C1_Overhaul'

const CARD_ID = C1_Overhaul.id

const rebuildFlow = (count: number): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: {
        kind: 'consume-fence',
        count,
        segmentType: 'fence',
        sourcePolicy: 'ownOnly',
      },
    },
    {
      type: 'leaf',
      actionId: 'fence',
      sourceCard: CARD_ID,
      actionContext: {
        trueAction: false,
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          sourcePolicy: 'ownOnly',
          segmentBounds: {
            fence: {
              min: count,
              max: Math.min(count + 3, MAX_ORDINARY_FENCE_PIECES),
            },
          },
          costPolicy: { fence: { wood: 0 } },
          cancelPolicy: 'forbidCancel',
          preserveAnimalTotals: true,
        },
      },
    },
  ],
})

export const C1_Overhaul_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fenceCount = getOwnOrdinaryFenceCount(player)
      if (fenceCount === 0) return undefined
      return rebuildFlow(fenceCount)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
