import { peopleLeftToPlace } from '../../../actions/guest-turns'
import { canPlaceWorkerOnSpace } from '../../../actions/helpers/placement-availability'
import type { ActionHookRegistry } from '../../../actions/hooks'
import type { GameState, PlayerState } from '../../../contract/types'
import { isGuestWorkerId } from '../../../domain/guests'
import {
  activeWorkSnakeOpening,
  roundWorkOrderStartIdx,
  workersAvailable,
} from '../../../domain/player'
import { hasHealthyWorkerAtHome } from '../../../moor/heating'
import { defineOccupationCard } from '../../card-source'
import { readCardExtraData } from '../../helpers/card-state'
import { grantGuestLeaf } from '../../helpers/guest-flow'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getRoundPersonPlacementDetails } from '../../helpers/round-placement'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM036_MasterCook'

const hasPlacedFamilyMemberThisRound = (player: PlayerState): boolean =>
  getRoundPersonPlacementDetails(player).some((entry) => !isGuestWorkerId(entry.workerId))

const countOtherPlayersPlacements = (state: GameState, playerId: string): number =>
  state.players
    .filter((candidate) => candidate.id !== playerId)
    .reduce((sum, candidate) => sum + getRoundPersonPlacementDetails(candidate).length, 0)

const canPlaceFamilyMemberNow = (state: GameState, player: PlayerState): boolean =>
  state.enableFarmersOfTheMoor
    ? hasHealthyWorkerAtHome(state, player)
    : workersAvailable(state, player) >= 1

const hasLegalSpaceForGrantedGuest = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): boolean =>
  state.actionSpaces.some((space) =>
    canPlaceWorkerOnSpace(state, player, space, {
      actionHooks,
      ignoreWorkerAvailability: true,
    }),
  )

const hasAnotherPlayerBeforeNextTurn = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): boolean => {
  const playerIdx = state.players.findIndex((candidate) => candidate.id === player.id)
  if (playerIdx < 0) return false

  const willPlaceMoreAfterFirst =
    workersAvailable(state, player) > 1 ||
    peopleLeftToPlace(state, player, actionHooks) > workersAvailable(state, player) ||
    hasLegalSpaceForGrantedGuest(state, player, actionHooks)
  if (!willPlaceMoreAfterFirst) return true

  const snake = activeWorkSnakeOpening(state)
  if (snake && !snake.reversed) {
    const count = state.players.length
    const startIdx = roundWorkOrderStartIdx(state)
    const stepsToStart = ((startIdx - playerIdx + count) % count) || count
    let otherBeforeReverse = false
    for (let step = 1; step < stepsToStart; step += 1) {
      const other = state.players[(playerIdx + step) % count]
      if (other && peopleLeftToPlace(state, other, actionHooks) > 0) {
        otherBeforeReverse = true
        break
      }
    }
    if (!otherBeforeReverse) return false
  }

  return state.players.some(
    (other) => other.id !== player.id && peopleLeftToPlace(state, other, actionHooks) > 0,
  )
}

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-first`,
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      replacesTurn: true,
      handler: (context) => {
        if (context.state.roundPhase !== 'work') return
        if (hasPlacedFamilyMemberThisRound(context.player)) return
        if (!canPlaceFamilyMemberNow(context.state, context.player)) return
        if (!hasAnotherPlayerBeforeNextTurn(context.state, context.player, context.actionHooks)) return

        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'seq',
            children: [
              {
                type: 'leaf',
                actionId: 'spend-worker',
                sourceCard: CARD_ID,
                actionContext: { familyPerson: true },
              },
              gainLeaf(CARD_ID, { food: 2 }),
              grantGuestLeaf(CARD_ID),
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'usedRound', value: context.state.round },
              },
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: {
                  kind: 'set-extra-data',
                  key: 'othersPlaced',
                  value: countOtherPlayersPlacements(context.state, context.player.id),
                },
              },
            ],
          },
        }
      },
    },
    {
      id: `${CARD_ID}-block-consecutive-place`,
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['isDoable'],
      handler: (context) => {
        if (context.actionSpaceUse?.newPlacement !== true) return
        const isGuestPlacement =
          (context.actionContext?.workerSource as { kind?: unknown } | undefined)?.kind === 'guest'
        if (isGuestPlacement) return
        if (
          readCardExtraData<number>(context.player, CARD_ID, 'usedRound') === context.state.round &&
          readCardExtraData<number>(context.player, CARD_ID, 'othersPlaced') ===
            countOtherPlayersPlacements(context.state, context.player.id)
        ) {
          return { doable: false }
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM036_MasterCook = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Cook',
    deck: 'CWM',
    number: 36,
    desc: [
      'Each round, instead of placing your first Family member on an Action space, you may place it on this card and receive 2 <FOOD> and 1 Guest token to place that round. (You may not do this if you will be placing more people after your first without another player placing in between.)',
    ],
    cost: {},
    vp: 0,
    prerequisite: '',
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM036.png',
  },
  impl: cardImpl,
})

export const CWM036_MasterCook_impl = CWM036_MasterCook.impl
