import { definePlayerActionCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import {
  registerPlayerActionSpace,
  createPlayerActionSpaces,
  definePlayerActionSpaceFlow,
} from '../../player-action-space'
import { smallestAvailableWorker } from '../../../domain/player'
import { readActionSnapshotExtraData } from '../../helpers/action-snapshot'
import { readCardExtraData } from '../../helpers/card-state'
import type { GameState, PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL004_EducationalBuilding'

const eligibleWorker = (state: GameState, player: PlayerState, workerId?: string) => {
  const placed = readActionSnapshotExtraData<string>(player, 'placedWorkerId')
  workerId ??= state.actionSpaces
    .find((space) => space.id === CARD_ID)
    ?.takenBy.find((ref) => ref.playerId === player.id && ref.workerId === placed)?.workerId
  const worker = workerId
    ? player.workers.find((item) => item.id === workerId)
    : smallestAvailableWorker(state, player)
  if (!worker || worker.isGuest) return false
  const rank =
    player.workers.filter((item) => !item.isGuest).findIndex((item) => item.id === worker.id) + 1
  const used = readCardExtraData<string[]>(player, CARD_ID, 'usedWorkers') ?? []
  return (
    [3, 4].includes(rank) &&
    !used.includes(worker.id) &&
    (!worker.firstWorkPlacement || worker.firstWorkPlacement.spaceId === CARD_ID)
  )
}
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) =>
    definePlayerActionSpaceFlow({
      id: CARD_ID,
      nameKey: `cards.${CARD_ID}.name`,
      descriptionKey: `cards.${CARD_ID}.name`,
      canBeExecutedByPlayer: (state, player, context) =>
        player.id === ownerId &&
        eligibleWorker(
          state,
          player,
          typeof context?.actionContext?.placedWorkerId === 'string'
            ? context.actionContext.placedWorkerId
            : undefined,
        ),
      flowFactory: ({ state, player, actionContext }) => {
        const workerId =
          typeof actionContext?.placedWorkerId === 'string'
            ? actionContext.placedWorkerId
            : state.actionSpaces
                .find((space) => space.id === CARD_ID)
                ?.takenBy.find((worker) => worker.playerId === player.id)?.workerId
        return {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'set-extra-data',
                key: 'usedWorkers',
                value: [
                  ...(readCardExtraData<string[]>(player, CARD_ID, 'usedWorkers') ?? []),
                  workerId,
                ],
              },
            },
            {
              type: 'leaf',
              actionId: 'future-meeples',
              sourceCard: CARD_ID,
              params: {
                __futureMeepleRequest: {
                  cardId: CARD_ID,
                  playerId: player.id,
                  entries: Array.from({ length: 14 - state.round }, (_, index) => ({
                    round: state.round + index + 1,
                    resources: index % 2 === 0 ? { wood: 1 } : { stone: 1 },
                  })),
                },
              },
            },
          ],
        }
      },
    }),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      state.actionSpaces.push(
        ...createPlayerActionSpaces(state).filter(
          (space) => !state.actionSpaces.some((existing) => existing.id === space.id),
        ),
      )
    },
  },
} satisfies CardImpl

export const CFL004_EducationalBuilding = definePlayerActionCard({
  meta: {
    id: 'CFL004_EducationalBuilding',
    name: 'Educational Building',
    deck: 'CFL',
    number: 4,
    cost: {
      stone: 1,
    },
    vp: 1,
    desc: [
      'This is an action space only you may use. The first time you send your third or fourth family member to work in the game, you may place them here. Put alternating <WOOD> and <STONE>, starting with wood, on all later rounds; take them at the start of those rounds.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL004.png',
    playerActionCardType: 'minor',
  },
  impl: cardImpl,
})
