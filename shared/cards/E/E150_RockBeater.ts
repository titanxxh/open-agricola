import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { isSpaceOccupied } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E150_RockBeater'

/**
 * E150 Rock Beater — Occupation (players: 4+).
 * 1. You can use an action space providing both stone and a different building resource
 *    even if it is occupied by another player. (resource-market-4 gives reed+stone+food)
 * 2. Stone rooms cost you 2 stone less each.
 *
 * BGA:
 * onPlayerComputeArgsPlaceFarmer → adds ActionResourceMarket4 as an extra occupied option.
 * onPlayerComputeCostsConstruct → removes 2 stone when stone is in the trade cost.
 */

// 1. Allow placing farmer on resource-market-4 when occupied
const computeArgsListener: CardListenerRegistration = {
  id: 'E150-rock-beater-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const space = context.state.actionSpaces.find((s) => s.id === 'resource-market-4')
    // Only add when occupied by another player
    if (!space || !isSpaceOccupied(space)) return
    if (!space.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}resource-market-4`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

// 2. Stone rooms cost 2 stone less
const constructCostListener: CardListenerRegistration = {
  id: 'E150-rock-beater-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'stone') return
    return { costs: { stone: -2 } }
  },
}

export const E150_RockBeater = new Occupation({
  id: CARD_ID,
  name: 'Rock Beater',
  deck: 'E',
  number: 150,
  category: 'ACTION',
  desc: [
    'You can use an action space providing both stone and a different building resource even if it is occupied by another player. Stone rooms cost you 2 <STONE> less each.',
  ],
  cost: {},
  players: '4+',
})

export const E150_RockBeater_impl = {
  listeners: [computeArgsListener, constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
