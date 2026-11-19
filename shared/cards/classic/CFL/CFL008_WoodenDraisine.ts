import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getClassicAdjacentSpaceIds } from '../../helpers/classic-board-topology'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { canPlaceWorkerOnSpace } from '../../../actions/helpers/placement-availability'
import { workersAvailable } from '../../../domain/player'
import { addSyntheticLinkedOccupancyRef } from '../../../domain/space'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { jumpLeaf } from '../../helpers/jump-leaf'
import type { GameState, PlayerState, ActionSpace, Resource } from '../../../contract/types'
import type { ActionHookRegistry } from '../../../actions/hooks'

const CARD_ID = 'CFL008_WoodenDraisine'

const CHOOSE = 'card_CFL008_WoodenDraisine_choose'
const COLLECT = 'card_CFL008_WoodenDraisine_collect'
type Pair = {
  first: string
  second: string
  leaveFirst: keyof Resource
  leaveSecond: keyof Resource
}
const goods = (space: ActionSpace) =>
  Object.entries(space.resources)
    .filter(([, amount]) => amount > 0)
    .map(([key]) => key as keyof Resource)
const pairs = (state: GameState, player: PlayerState, actionHooks?: ActionHookRegistry): Pair[] => {
  const spaces = state.actionSpaces.filter(
    (space) =>
      Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0) &&
      Object.values(space.resources).reduce((sum, value) => sum + value, 0) >= 2 &&
      canPlaceWorkerOnSpace(state, player, space, { actionHooks, sourceCard: CARD_ID }),
  )
  return spaces.flatMap((first) =>
    spaces
      .filter((second) => getClassicAdjacentSpaceIds(state, first.id).includes(second.id))
      .flatMap((second) =>
        goods(first).flatMap((leaveFirst) =>
          goods(second).map((leaveSecond) => ({
            first: first.id,
            second: second.id,
            leaveFirst,
            leaveSecond,
          })),
        ),
      ),
  )
}
registerAdHocAction({
  id: CHOOSE,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    pairs(state, player, context?.actionHooks).length > 0,
  execute: ({ state, player, actionHooks }) => ({
    type: 'request',
    promptKey: 'ui.interactionFlowSelect',
    request: {
      kind: 'choice',
      options: pairs(state, player, actionHooks).map((pair) => ({
        value: JSON.stringify(pair),
        labelKey: `cards.${CARD_ID}.name`,
        sourceCard: CARD_ID,
        descriptionPreview: {
          kind: 'group',
          operator: 'sequence',
          separator: ', ',
          parts: [
            [pair.first, pair.leaveFirst],
            [pair.second, pair.leaveSecond],
          ].map(([id, retained]) => {
            const space = state.actionSpaces.find((entry) => entry.id === id)!
            return {
              kind: 'action',
              labelKey: space.nameKey,
              effectPreview: {
                kind: 'resourceMovement',
                resources: { [retained!]: 1 },
                from: { kind: 'actionSpace', spaceId: id!, nameKey: space.nameKey },
                to: { kind: 'actionSpace', spaceId: id!, nameKey: space.nameKey },
              },
            }
          }),
        },
      })),
    },
  }),
  resolveChoice: ({ state, player, actionHooks }, choice) => {
    const pair = pairs(state, player, actionHooks).find((pair) => JSON.stringify(pair) === choice)
    if (!pair) return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, CARD_ID, 'pair', pair)
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'place-farmer',
        sourceCard: CARD_ID,
        actionContext: { constraints: [pair.first] },
      },
    }
  },
})
registerAdHocAction({
  id: COLLECT,
  nameKey: 'actions.collect.name',
  descriptionKey: 'actions.collect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space }) => {
    const pair = readCardExtraData<Pair>(player, CARD_ID, 'pair')
    const second = state.actionSpaces.find((entry) => entry.id === pair?.second)
    const worker = space.takenBy.find((ref) => ref.playerId === player.id && !ref.synthetic)
    if (!pair || !second || !worker || second.takenBy.length > 0)
      return { type: 'fail', errorKey: 'log.actionFail' }
    addSyntheticLinkedOccupancyRef(second, player.id, worker.workerId, CARD_ID)
    writeCardExtraData(player, CARD_ID, 'pair', undefined)
    const jump = jumpLeaf({ sourceCard: CARD_ID, targetSpaceId: second.id })
    if (jump.type !== 'leaf') return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'collect',
            sourceCard: CARD_ID,
            actionContext: { checkedReplaceAction: true, leaveOnSpace: { [pair.leaveFirst]: 1 } },
          },
          {
            ...jump,
            actionContext: { ...jump.actionContext, leaveOnSpace: { [pair.leaveSecond]: 1 } },
          },
        ],
      },
    }
  },
})

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-two-spaces',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      replacesTurn: true,
      handler: ({ state, player, actionHooks }) =>
        state.roundPhase === 'work' &&
        state.players[state.currentPlayerIndex]?.id === player.id &&
        workersAvailable(state, player) > 0 &&
        pairs(state, player, actionHooks).length
          ? { flow: { type: 'leaf', actionId: CHOOSE, sourceCard: CARD_ID } }
          : undefined,
    },
    {
      id: CARD_ID + '-collect-pair',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['computeReplace'],
      handler: ({ player, space, actionContext }) =>
        actionContext?.checkedReplaceAction !== true &&
        readCardExtraData<Pair>(player, CARD_ID, 'pair')?.first === space?.id
          ? { actionId: COLLECT, sourceCard: CARD_ID }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL008_WoodenDraisine = defineMinorCard({
  meta: {
    id: 'CFL008_WoodenDraisine',
    name: 'Wooden Draisine',
    deck: 'CFL',
    number: 8,
    cost: {
      wood: 1,
    },
    vp: 0,
    desc: [
      'You may use one person on two orthogonally adjacent accumulation spaces on the same classic game board. Both spaces count as occupied. Leave one good on each space.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL008.png',
  },
  impl: cardImpl,
})
