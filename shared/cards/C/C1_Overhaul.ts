import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import {
  getOwnOrdinaryFenceCount,
} from '../../domain/fence-segments'
import { getOwnOrdinaryFenceBuildLimit } from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'

const CARD_ID = 'C1_Overhaul'
const rebuildFlow = (count: number, buildLimit: number): ActionFlow => ({
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
              max: Math.min(count + 3, buildLimit),
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

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const fenceCount = getOwnOrdinaryFenceCount(player)
      if (fenceCount === 0) return undefined
      return rebuildFlow(fenceCount, getOwnOrdinaryFenceBuildLimit(player))
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C1_Overhaul = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Overhaul',
    deck: 'C',
    number: 1,
    category: 'FARM_PLANNER',
    desc: ['Immediately raze all of your fences, add up to 3 fences from your supply, and rebuild them. (You do not lose any animals during this.)'],
    cost: { wood: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    passing: true,
  },
  impl: cardImpl,
})

export const C1_Overhaul_impl = C1_Overhaul.impl
