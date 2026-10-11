import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B018_GrasslandHarrow'
const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const


const cardImpl = {
  getBaseCosts: () => ({
    fee: { wood: 2 },
    resourceReserve: { resources: BUILDING_RESOURCES, minimum: 1 },
  }),
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const reserve = BUILDING_RESOURCES.reduce(
        (total, resource) => total + player.resources[resource],
        0,
      )
      const targetRound = state.round + reserve
      if (reserve <= 0 || targetRound > 14) return
      return {
        ...futureMeeplesNode({
          cardId: CARD_ID,
          playerId: player.id,
          entries: [{ round: targetRound, resources: { field: 1 } }],
        }),
        sourceCard: CARD_ID,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B018_GrasslandHarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grassland Harrow',
    deck: 'B',
    number: 18,
    category: 'FARM_PLANNER',
    desc: [
        'Add 1 to the current round for each building resource in your supply and place 1 <FIELD> on the corresponding round space. At the start of the round, you can plow the <FIELD>.',
      ],
    cost: { wood: 2 },
    prerequisite: '2 Occ., 1 Resource After Payment',
    occupationPrerequisites: { min: 2 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B018_GrasslandHarrow_impl = B018_GrasslandHarrow.impl
