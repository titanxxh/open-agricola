import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B18_GrasslandHarrow'
const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const

const afterPayListener: CardListenerRegistration = {
  id: 'B18-grassland-harrow-after-pay',
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const result = context.result
    if (!result || result.type !== 'ok') return
    const supply = context.player.resources as Resource
    const reserve = BUILDING_RESOURCES.reduce(
      (total, resource) => total + (supply[resource] ?? 0),
      0,
    )
    if (reserve <= 0) return
    const targetRound = Math.min(14, context.state.round + reserve)
    return {
      sourceCard: CARD_ID,
      flow: {
        ...futureMeeplesNode({
          cardId: CARD_ID,
          playerId: context.player.id,
          entries: [{ round: targetRound, resources: { field: 1 } }],
        }),
        sourceCard: CARD_ID,
      },
    }
  },
}

const cardImpl = {
  listeners: [afterPayListener],
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B18_GrasslandHarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grassland Harrow',
    deck: 'B',
    number: 18,
    category: 'FARM_PLANNER',
    desc: [
        'Add 1 to the current round for each building resource in your supply and place 1 field on the corresponding round space. At the start of the round, you can plow the field.',
      ],
    cost: { wood: 2 },
    prerequisite: '2 Occ., 1 Resource After Payment',
    occupationPrerequisites: { min: 2 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B18_GrasslandHarrow_impl = B18_GrasslandHarrow.impl
