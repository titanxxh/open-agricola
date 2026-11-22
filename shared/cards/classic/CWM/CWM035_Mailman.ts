import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../../contract/types'
import { openRoundForSpace } from '../../../actions/helpers/placement-availability'
import {
  getActionSpaceAttachments,
  writeCardExtraData,
  ACTION_SPACE_ATTACHMENTS_KEY,
} from '../../helpers/card-state'
import { gainLeaf, payLeaf } from '../../helpers/pay-gain-node'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM035_Mailman'

const bundles: Partial<Resource>[] = [{ wood: 2 }, { clay: 2 }, { reed: 1 }, { stone: 1 }]
const placement = (state: GameState, player: PlayerState): ActionFlow | undefined => {
  const attached = getActionSpaceAttachments(player, CARD_ID)
  if (attached.length >= 4) return
  const spaces = state.actionSpaces.filter(
    (s) =>
      !s.id.startsWith('card-worker:') &&
      openRoundForSpace(state, s) <= state.round &&
      !attached.some((a) => a.spaceId === s.id),
  )
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: CARD_ID,
    params: {
      requiresExplicitChoice: true,
      options: spaces.map((s) => ({
        value: 'place:' + s.id,
        labelKey: s.nameKey,
        effectPreview: {
          kind: 'resourceMovement',
          resources: bundles[attached.length],
          from: { kind: 'supply' },
          to: { kind: 'actionSpace', spaceId: s.id, nameKey: s.nameKey },
        },
      })),
    },
  }
}
const TAKE = 'card_' + CARD_ID + '_take'
registerAdHocAction({
  id: TAKE,
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params }) => {
    const owner = state.players.find((p) => p.id === params?.ownerId)
    if (!owner) return { type: 'fail', errorKey: 'log.action' }
    const entries = getActionSpaceAttachments(owner, CARD_ID),
      bundle = entries.find((e) => e.spaceId === params?.spaceId)
    if (!bundle) return { type: 'fail', errorKey: 'log.action' }
    writeCardExtraData(
      owner,
      CARD_ID,
      ACTION_SPACE_ATTACHMENTS_KEY,
      entries.filter((e) => e !== bundle),
    )
    return { type: 'flow', flow: gainLeaf(CARD_ID, bundle.resources) }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: placement,
    resolveChoice: (state, player, choice) => {
      if (!choice.startsWith('place:')) return
      const spaceId = choice.slice(6),
        space = state.actionSpaces.find((s) => s.id === spaceId)
      const entries = getActionSpaceAttachments(player, CARD_ID)
      if (
        !space ||
        openRoundForSpace(state, space) > state.round ||
        entries.length >= 4 ||
        entries.some((e) => e.spaceId === spaceId)
      )
        return
      writeCardExtraData(player, CARD_ID, ACTION_SPACE_ATTACHMENTS_KEY, [
        ...entries,
        { spaceId, resources: bundles[entries.length] },
      ])
      return placement(state, player)
    },
  },
  listeners: [
    {
      id: CARD_ID + '-offer',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player,
          actor = context.triggerPlayer ?? context.player
        if (!getActionSpaceAttachments(owner, CARD_ID).some((e) => e.spaceId === context.space.id))
          return
        const ownerUses = actor.id === owner.id
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'seq',
            targetPlayerId: actor.id,
            optional: !ownerUses,
            children: [
              ...(!ownerUses
                ? [
                    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
                    { ...gainLeaf(CARD_ID, { food: 1 }), targetPlayerId: owner.id },
                  ]
                : []),
              {
                type: 'leaf',
                actionId: TAKE,
                sourceCard: CARD_ID,
                params: { ownerId: owner.id, spaceId: context.space.id },
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM035_Mailman = defineOccupationCard({
  meta: {
    id: 'CWM035_Mailman',
    name: "Mailman",
    deck: 'CWM',
    number: 35,
    desc: ["Place 2 wood, 2 clay, 1 reed, and 1 stone on four different revealed action spaces, occupied or not. The next player to use each space may pay you 1 food to take its resources. You need not pay yourself."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM035.png',
  },
  presentation: { actionSpaceAttachments: true },
  impl: cardImpl,
})

export const CWM035_Mailman_impl = CWM035_Mailman.impl
