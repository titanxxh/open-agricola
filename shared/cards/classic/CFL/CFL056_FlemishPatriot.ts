import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getClassicColumnSpaceIds } from '../../helpers/classic-board-topology'
import { getSpaceUsePersonPlacementOrdinal } from '../../helpers/round-placement'
import { getActionSpaceAttachments } from '../../helpers/card-state'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL056_FlemishPatriot'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-column',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      requiresNewPlacement: true,
      handler: (context) => {
        if (
          context.state.round % 2 !== 0 ||
          getSpaceUsePersonPlacementOrdinal(context.player, context.actionContext) !== 1 ||
          !context.space
        )
          return
        const ids = getClassicColumnSpaceIds(context.state, context.space.id)
        const attachments = getActionSpaceAttachments(context.player, CARD_ID).map((item) => ({
          ...item,
          resources: { ...item.resources },
        }))
        for (const space of context.state.actionSpaces.filter(
          (space) => ids.includes(space.id) && space.takenBy.length === 0,
        )) {
          const existing = attachments.find((item) => item.spaceId === space.id)
          if (existing) existing.resources.food = (existing.resources.food ?? 0) + 1
          else attachments.push({ spaceId: space.id, resources: { food: 1 } })
        }
        return {
          flow: {
            type: 'seq',
            children: [
              gainLeaf(CARD_ID, { food: 1 }),
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: {
                  kind: 'set-extra-data',
                  key: 'actionSpaceAttachments',
                  value: attachments,
                },
              },
            ],
          },
        }
      },
    },
    {
      id: CARD_ID + '-claim-food',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        const attachments = getActionSpaceAttachments(owner, CARD_ID)
        const food =
          attachments.find((item) => item.spaceId === context.space?.id)?.resources.food ?? 0
        if (!food) return
        return {
          flow: {
            type: 'seq',
            targetPlayerId: owner.id,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: {
                  kind: 'set-extra-data',
                  key: 'actionSpaceAttachments',
                  value: attachments
                    .filter((item) => item.spaceId !== context.space?.id)
                    .map((item) => ({ ...item, resources: { ...item.resources } })),
                },
              },
              {
                type: 'leaf',
                actionId: 'gain',
                sourceCard: CARD_ID,
                params: { food, recipientPlayerId: (context.triggerPlayer ?? context.player).id },
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL056_FlemishPatriot = defineOccupationCard({
  meta: {
    id: 'CFL056_FlemishPatriot',
    name: 'Flemish Patriot',
    deck: 'CFL',
    number: 56,
    players: '1+',
    desc: [
      'In each even round, after you use your first action space, you get 1 <FOOD>. Put 1 <FOOD> on each unoccupied space in its board column. The next player to use each space takes that food, even in a later round.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL056.png',
  },
  presentation: { actionSpaceAttachments: true },
  impl: cardImpl,
})
