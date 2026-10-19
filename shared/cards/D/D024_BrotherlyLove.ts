import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { findActionSpaceByWorker } from '../../domain/space'
import { familySize, workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import type { PersonUseReceipt } from '../../contract/person-use'
import { createEventQuery } from '../../events/query'

const CARD_ID = 'D024_BrotherlyLove'
const THIRD_WORKER_KEY = 'brotherlyLoveThirdWorkerId'

const afterPersonUse = (
  context: CardListenerContext,
  personUse: PersonUseReceipt | undefined,
): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  if (familySize(context.player) !== 4 || workersAvailable(context.state, context.player) === 0) return
  if (personUse?.placementOrdinal !== 3) return
  return {
    flow: {
      type: 'leaf',
      actionId: 'place-farmer',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { [THIRD_WORKER_KEY]: personUse.workerId },
    },
    sourceCard: CARD_ID,
  }
}

const afterPlacementListener: CardListenerRegistration = {
  id: 'D24-brotherly-love-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['place-farmer'],
  handler: context => afterPersonUse(context,
    context.result && 'personUse' in context.result ? context.result.personUse : undefined),
}

const afterCardUseListener: CardListenerRegistration = {
  id: 'D24-brotherly-love-after-card-person-use',
  cardIds: [CARD_ID],
  phases: ['after'],
  events: ['worker.useCompleted'],
  handler: context => afterPersonUse(context,
    createEventQuery(context.actionEvents ?? []).find('worker.useCompleted')),
}

const computeArgsListener: CardListenerRegistration = {
  id: 'D24-brotherly-love-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const workerId = context.actionContext?.[THIRD_WORKER_KEY]
    if (typeof workerId !== 'string') return
    const space = findActionSpaceByWorker(context.state, context.player.id, workerId)
    if (
      !space ||
      !space.takenBy.some((worker) =>
        worker.playerId === context.player.id && worker.workerId === workerId)
    ) return
    const option: ActionChoiceOption = {
      value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
      labelKey: space.nameKey,
      sourceCard: CARD_ID,
    }
    return { extraOptions: [option], sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterPlacementListener, afterCardUseListener, computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D024_BrotherlyLove = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Brotherly Love',
    deck: 'D',
    number: 24,
    category: 'ACTIONS_BOOSTER',
    desc: [
      'As long as you have exactly 4 people, in the work phase of each round, you can place your third and fourth person immediately after one another, even on the same action space.',
    ],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const D024_BrotherlyLove_impl = D024_BrotherlyLove.impl
