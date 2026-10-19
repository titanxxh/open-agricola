import { defineOccupationCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getAssignedAnimalsByType } from '../../domain/animals'
import { createAnimalScheduleSelectionAction, type QuantitySchedule } from '../../actions/plans/quantity-schedule'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'B157_Salter'
const PICK_ACTION_ID = 'card_B157_Salter_salt-pick'

const SCHEDULE = [
  { resource: 'sheep', rounds: 3, resourcesPerUnit: { food: 1 } },
  { resource: 'boar', rounds: 5, resourcesPerUnit: { food: 1 } },
  { resource: 'cattle', rounds: 7, resourcesPerUnit: { food: 1 } },
] as const satisfies QuantitySchedule

export const salterPickAction = createAnimalScheduleSelectionAction(PICK_ACTION_ID, CARD_ID, SCHEDULE, 'cards.B157_Salter.pickAnimals', 'log.salterFutureFood')

registerAdHocAction(salterPickAction)

const anytimeListener: CardListenerRegistration = {
  id: 'B157-salter-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player } = context
    const onBoard = getAssignedAnimalsByType(player, state)
    const totalOnBoard = onBoard.sheep + onBoard.boar + onBoard.cattle
    if (totalOnBoard < 1) return
    const reserveSum =
      (player.resources.sheep ?? 0) - onBoard.sheep +
      (player.resources.boar ?? 0) - onBoard.boar +
      (player.resources.cattle ?? 0) - onBoard.cattle
    if (reserveSum > 0) return
    if (state.round + 1 > 14) return

    let singleOnly: 'sheep' | 'boar' | 'cattle' | null = null
    if (onBoard.sheep === 1 && onBoard.boar === 0 && onBoard.cattle === 0) singleOnly = 'sheep'
    else if (onBoard.boar === 1 && onBoard.sheep === 0 && onBoard.cattle === 0) singleOnly = 'boar'
    else if (onBoard.cattle === 1 && onBoard.sheep === 0 && onBoard.boar === 0) singleOnly = 'cattle'

    if (singleOnly) {
      return {
        flow: {
          type: 'leaf',
          actionId: PICK_ACTION_ID,
          sourceCard: CARD_ID,
          params: { presetCounts: { [singleOnly]: 1 } },
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: { type: 'leaf', actionId: PICK_ACTION_ID, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (state, player, request, actionId) => {
      if (actionId !== PICK_ACTION_ID || request.kind !== 'resource-quantity-select') return request
      const { sheep, boar, cattle } = getAssignedAnimalsByType(player, state)
      return { ...request, availableByResource: { sheep, boar, cattle } }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B157_Salter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Salter',
    deck: 'B',
    number: 157,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can pay 1 <SHEEP>/<PIG>/<CATTLE> from your farm. If you do, place 1 <FOOD> on each of the next 3/5/7 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B157_Salter_impl = B157_Salter.impl
