import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getRoundPlacementOrder } from '../../helpers/round-placement'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { readCardExtraData } from '../../helpers/card-state'

const CARD_ID = 'CFL044_Returnee'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state, player) => {
      const spaceId = getRoundPlacementOrder(player).at(-1)
      return {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'dueRound', value: state.round + 1 },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: {
              kind: 'set-extra-data',
              key: 'actionSpaceAttachments',
              value: spaceId ? [{ spaceId, resources: { grain: 1 } }] : [],
            },
          },
        ],
      }
    },
  },
  listeners: [
    {
      id: CARD_ID + '-retrieve',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        const due = readCardExtraData<number>(owner, CARD_ID, 'dueRound')
        const attachments =
          readCardExtraData<Array<{ spaceId: string }>>(owner, CARD_ID, 'actionSpaceAttachments') ??
          []
        if (
          due !== context.state.round ||
          !attachments.some((item) => item.spaceId === context.space?.id)
        )
          return
        return {
          flow: {
            type: 'seq',
            targetPlayerId: owner.id,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'actionSpaceAttachments', value: [] },
              },
              ...((context.triggerPlayer ?? context.player).id === owner.id
                ? [gainLeaf(CARD_ID, { grain: 1 })]
                : []),
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL044_Returnee = defineOccupationCard({
  meta: {
    id: 'CFL044_Returnee',
    name: 'Returnee',
    deck: 'CFL',
    number: 44,
    players: '1+',
    desc: [
      'At the end of each work phase, put 1 <GRAIN> from the general supply on the action space you used last. In the next round, if you use that space, take the grain first; otherwise discard it.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL044.png',
  },
  presentation: { actionSpaceAttachments: true },
  impl: cardImpl,
})
