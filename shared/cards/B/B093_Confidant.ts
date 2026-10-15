import { defineOccupationCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import {
  collectOccupationActionPaymentOptions,
  hasPlayableOccupationChoice,
} from '../../actions/effects/occupation'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../contract/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { LESSONS_SPACE_IDS, isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'B093_Confidant'
const MIN_FUTURE_FOOD = 2

const readOccupationBaseCost = (context: CardListenerContext): Partial<Resource> => {
  const baseCost = context.extraData?.occupationBaseCost
  if (!baseCost || typeof baseCost !== 'object') return {}
  return baseCost as Partial<Resource>
}

const canAffordMinimumSchedule = (context: CardListenerContext) => {
  const baseCost = readOccupationBaseCost(context)
  const options = collectOccupationActionPaymentOptions(
    context.state,
    context.player,
    CARD_ID,
    baseCost,
    context.actionCardId, undefined, context?.actionHooks
  )
  const currentFood = context.player.resources.food ?? 0
  return options.some((option) =>
    currentFood - (option.resourcesPaid.food ?? 0) >= MIN_FUTURE_FOOD,
  )
}

const minimumScheduleListener: CardListenerRegistration = {
  id: 'B93-confidant-isdoable-minimum-schedule',
  actions: ['occupation', ...LESSONS_SPACE_IDS],
  phases: ['isDoable' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) {
      if (
        isLessonsSpaceId(context.actionId) &&
        context.player.occupationHand.includes(CARD_ID) &&
        !hasPlayableOccupationChoice(context.state, context.player, context.actionId, undefined, context?.actionHooks)
      ) {
        return { doable: false }
      }
      return
    }
    if (canAffordMinimumSchedule(context)) {
      return { reserveResources: { food: MIN_FUTURE_FOOD } }
    }
    return { doable: false }
  },
}

const countChoices = (state: GameState, player: PlayerState): ActionFlow[] => {
  const max = Math.max(2, Math.min(14 - state.round, 4))
  return Array.from({ length: max - 1 }, (_, index) => {
    const count = index + 2
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: count } }),
        futureMeeplesNode({
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count,
          resources: { food: 1 },
        }),
      ],
    }
  })
}

const cardImpl = {
  listeners: [minimumScheduleListener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return {
      type: 'xor' as const,
      children: countChoices(state, player),
    }
  },
  timedRules: [{ retainAfterCardLeaves: true, key: 'after-scheduled-food', at: { kind: 'future-source', phase: 'onRoundStart' }, body: {
    kind: 'optional', body: { kind: 'xor', children: [
      { kind: 'action', actionId: 'sow', policy: { trueAction: false } },
      { kind: 'action', actionId: 'fence', policy: { trueAction: false, fencePolicy: { costPolicy: { fence: { wood: 1 } } } } },
    ] },
  } }],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B093_Confidant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Confidant',
    deck: 'B',
    number: 93,
    category: 'ACTIONS_BOOSTER',
    desc: ['Place 1 <FOOD> from your supply on each of the next 2, 3, or 4 round spaces. At the start of these rounds, you get the <FOOD> back and your choice of a __Sow__ or __Build Fences__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B093_Confidant_impl = B093_Confidant.impl
