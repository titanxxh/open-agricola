import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CFL033_Sculptor'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-collect',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        const received = createEventQuery(context.ownActionEvents ?? context.actionEvents ?? [])
          .filter('resource.moved')
          .filter(
            (event) =>
              event.from.kind === 'actionSpace' &&
              event.to.kind === 'player' &&
              event.to.playerId === context.player.id,
          )
          .flatMap((event) =>
            Object.entries(event.resources)
              .filter(([, count]) => (count ?? 0) > 0)
              .map(([resource]) => resource),
          )
        if (
          received.length &&
          received.every((resource) => resource === 'clay' || resource === 'stone')
        )
          return { flow: gainLeaf(CARD_ID, { food: 1 }) }
      },
    },
  ],
} satisfies CardImpl

export const CFL033_Sculptor = defineOccupationCard({
  meta: {
    id: 'CFL033_Sculptor',
    name: 'Sculptor',
    deck: 'CFL',
    number: 33,
    players: '1+',
    desc: [
      'Whenever you take only <CLAY> and/or <STONE> from an accumulation space, you get 1 <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL033.png',
  },
  impl: cardImpl,
})
