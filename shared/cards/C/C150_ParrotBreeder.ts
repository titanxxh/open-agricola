import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../contract/types'
import {
  isCardFlagged,
  readCardExtraData,
} from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { evaluateWithReservedResources } from '../helpers/reserved-resources'
import { isPlacementActionDoableInFlowContext } from '../../actions/flow'
import { canEnterSpace } from '../../actions/helpers/placement-availability'
import { getActionDefinition } from '../../actions/action-definition-lookup'
import { findActionSpaceById, isSpaceBlocked, isSpaceOccupied } from '../../domain/space'
import { canMoorWorkerEnterSpace } from '../../moor/heating'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import type { CardImpl } from '../registry'

const CARD_ID = 'C150_ParrotBreeder'
const RIGHT_KEY = 'right'

/** Tracks the right neighbour's latest actual target, including moves.
 * Settlement of an enclosing use must not overwrite a later target.
 */

const rightNeighbourIndex = (state: { players: PlayerState[] }, ownerId: string): number => {
  const n = state.players.length
  const ownerIdx = state.players.findIndex((p) => p.id === ownerId)
  if (ownerIdx < 0) return -1
  return (ownerIdx - 1 + n) % n
}

const trackerFlow = (
  right: string | null,
  targetPlayerId?: string,
): ActionHookResult => {
  const actionContext = targetPlayerId ? { targetPlayerId } : undefined
  return {
    flow: {
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          ...(actionContext ? { actionContext } : {}),
          params: { kind: 'set-extra-data', key: RIGHT_KEY, value: right },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          ...(actionContext ? { actionContext } : {}),
          params: { kind: 'set-flag', flag: false },
        },
      ],
    },
    sourceCard: CARD_ID,
  }
}

const afterPlaceFarmerSelfListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-after-self-place',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Owner just placed; consume the flag/tracker pairing.
    const flagged = isCardFlagged(context.player, CARD_ID)
    const right = readCardExtraData<string | null>(context.player, CARD_ID, RIGHT_KEY) ?? null
    if (!flagged && right === null) return
    return trackerFlow(null)
  },
}

const afterPlaceFarmerOpponentListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-after-opponent-place',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return
    const placer = context.player
    const rightIdx = rightNeighbourIndex(context.state, owner.id)
    const rightId = rightIdx >= 0 ? context.state.players[rightIdx]?.id : undefined
    const right = placer.id === rightId
      ? getRoundPlacementOrder(placer).at(-1) ?? context.space?.id ?? null
      : null
    const flagged = isCardFlagged(owner, CARD_ID)
    const currentRight = readCardExtraData<string | null>(owner, CARD_ID, RIGHT_KEY) ?? null
    if (!flagged && currentRight === right) return
    return trackerFlow(right, owner.id)
  },
}

const anytimeListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  scope: 'player',
  replacesTurn: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if ((context.player.resources.grain ?? 0) < 1) return
    if (context.state.roundPhase !== 'work') return
    const right = readCardExtraData<string | null>(context.player, CARD_ID, RIGHT_KEY)
    if (typeof right !== 'string' || right === 'meeting-place') return
    const space = findActionSpaceById(context.state, right)
    if (!space || !isSpaceOccupied(space) || isSpaceBlocked(space)) return
    if (space.flow?.type === 'seq' && space.flow.children.every(child =>
      child.type === 'leaf' && child.actionId === 'collect',
    ) && !Object.values(space.resources).some(amount => amount > 0)) return
    if (!canEnterSpace(space, context.player, context.state)) return
    if (!canMoorWorkerEnterSpace(context.state, context.player, space.id)) return
    if (!evaluateWithReservedResources(context.state, context.player, { grain: 1 }, (state, player) =>
      isPlacementActionDoableInFlowContext({
      actionHooks: context?.actionHooks,
        state, player, space, action: space, actionId: space.id, sourceCard: CARD_ID,
        resolveAction: (actionId) => findActionSpaceById(state, actionId) ?? getActionDefinition(actionId),
      }),
    )) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID,
            actionContext: { constraints: [right] },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeArgsListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-compute-args-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['computeArgs' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return
    if (context.sourceCard !== CARD_ID) return
    const right = readCardExtraData<string | null>(context.player, CARD_ID, RIGHT_KEY)
    if (typeof right !== 'string' || right.length === 0) return
    if (right === 'meeting-place') return
    const space = context.state.actionSpaces.find((s) => s.id === right)
    if (!space) return
    return {
      extraOptions: [
        {
          value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${right}`,
          labelKey: space.nameKey,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
}

const cardImpl = {
  listeners: [
    afterPlaceFarmerSelfListener,
    afterPlaceFarmerOpponentListener,
    anytimeListener,
    computeArgsListener,
  ],
  effect: {
    id: CARD_ID,
    // Defensive clear at round start so a dropped after-place hook can never
    // leak state across rounds.
    onBeforeStartOfTurn: () => trackerFlow(null).flow,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C150_ParrotBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Parrot Breeder',
    deck: 'C',
    number: 150,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'On your turn, if you pay 1 <GRAIN> to the general supply, you can use the same action space (unless it is the __Meeting Place__ action space) that the player to your right has just used on their turn (not retroactive).',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const C150_ParrotBreeder_impl = C150_ParrotBreeder.impl
