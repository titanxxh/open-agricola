import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import type { CardImpl } from '../registry'
import { readActionSnapshotExtraData } from '../helpers/action-snapshot'
import { findActionSpaceByWorker } from '../../domain/space'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'

const CARD_ID = 'A129_Swagman'
const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'grain-seeds',
  'grain-seeds': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'A129-swagman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const workerId = context.actionContext?.workerId
      ?? readActionSnapshotExtraData<unknown>(context.player, 'placedWorkerId')
    if (typeof workerId !== 'string' || !context.space.takenBy.some(ref =>
      ref.playerId === context.player.id && ref.workerId === workerId)) return
    const actionContext = {
      ...context.actionContext, viaCardJump: true, sourceCard: CARD_ID, workerId, targetSpaceId,
    }
    const allowed = computeAllowedPlacementSpaces(context.state, context.player, { actionHooks: context.actionHooks,
      sourceCard: CARD_ID, actionContext, ignoreWorkerAvailability: true,
    })
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const occupiedTargetListener: CardListenerRegistration = {
  id: 'A129-swagman-occupied-jump-target',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['computeArgs'],
  handler: context => {
    const jump = context.actionContext
    if (context.sourceCard !== CARD_ID || jump?.viaCardJump !== true
      || typeof jump.workerId !== 'string' || typeof jump.targetSpaceId !== 'string') return
    const from = findActionSpaceByWorker(context.state, context.player.id, jump.workerId)
    if (!from || TRIGGER_PAIRS[from.id] !== jump.targetSpaceId) return
    return { extraOptions: [{
      value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${jump.targetSpaceId}`,
      labelKey: `actions.${jump.targetSpaceId}.name`, sourceCard: CARD_ID,
    }] }
  },
}

const cardImpl = {
  listeners: [listener, occupiedTargetListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A129_Swagman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Swagman',
    deck: 'A',
    number: 129,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Immediately after each time you use the __Farm Expansion__ or __Grain Seeds__ action space, you can use the respective other space with the same person (even if it is occupied).',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A129_Swagman_impl = A129_Swagman.impl
