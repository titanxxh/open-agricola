import { defineOccupationCard } from '../card-source'
import type { ActionSpace, Resource } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B161_Weakling'
/**
 * B161 Weakling — Each time it is your turn in the work phase, if there are
 * one or more accumulation spaces with 5+ goods on them and you do not use
 * any of them, you get 1 VEGETABLE.
 *
 * Rule: isActionCardTurnEvent (any round/placement event) →
 * onPlayerPlaceFarmer scans ActionCards::getAccumulationSpaces() and:
 *   - returns nothing if the played space is one with 5+ goods,
 *   - returns gainNode([VEGETABLE => 1]) if any other accumulation space has 5+ goods.
 *
 * We approximate by scanning state.actionSpaces for spaces with non-empty
 * gainPerRound (i.e. accumulating spaces) and totalling their resources.
 *
 * The before reward is available to the space's own actions. Shared before
 * admission makes an otherwise unavailable space selectable when this
 * gain can start, without a card-specific doability override.
 */
const isAccumulationSpace = (space: ActionSpace): boolean => {
  const gpr = space.gainPerRound ?? {}
  return Object.values(gpr).some((v) => (v ?? 0) > 0)
}

const totalResources = (res?: Partial<Resource>): number => {
  if (!res) return 0
  return Object.values(res).reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

const listener: CardListenerRegistration = {
  id: 'B161-weakling-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['place-farmer'],
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'work') return
    if (
      context.actionContext?.viaCardJump === true &&
      typeof context.actionContext.workerId !== 'string'
    ) return
    const usedSpaceId = context.space?.id
    const accumulationSpaces = (context.state.actionSpaces ?? []).filter(
      isAccumulationSpace,
    )
    let hasFiveOrMore = false
    for (const space of accumulationSpaces) {
      if (totalResources(space.resources) >= 5) {
        hasFiveOrMore = true
        if (space.id === usedSpaceId) {
          // Player used one of the 5+ spaces -> no bonus
          return
        }
      }
    }
    if (!hasFiveOrMore) return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B161_Weakling = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Weakling',
    deck: 'B',
    number: 161,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time it is your turn in the work phase, if there are one or more accumulation spaces with 5+ goods on them and you do not use any of them, you get 1 <VEGETABLE>.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B161_Weakling_impl = B161_Weakling.impl
