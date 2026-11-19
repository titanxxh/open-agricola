import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM054_WheelbarrowPusher'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-one-resource',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        const keys = ['wood', 'clay', 'reed', 'stone'] as const
        if (!keys.some((key) => (context.space.gainPerRound[key] ?? 0) > 0)) return
        const count = createEventQuery(context.actionEvents ?? [])
          .filter('resource.moved')
          .filter(
            (e) =>
              e.from.kind === 'actionSpace' &&
              e.from.spaceId === context.space.id &&
              e.to.kind === 'player' &&
              e.to.playerId === context.player.id,
          )
          .reduce((sum, e) => sum + keys.reduce((n, key) => n + (e.resources[key] ?? 0), 0), 0)
        if (count !== 1) return
        const resources = context.state.players.length <= 3 ? [...keys, 'food'] : keys
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            children: resources.map((resource) =>
              gainLeaf(CARD_ID, {
                [resource]: 1,
                ...(context.state.players.length >= 4 ? { food: 1 } : {}),
              }),
            ),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM054_WheelbarrowPusher = defineOccupationCard({
  meta: {
    id: 'CWM054_WheelbarrowPusher',
    name: "Wheelbarrow Pusher",
    deck: 'CWM',
    number: 54,
    desc: ["Whenever you receive exactly 1 building resource from an accumulation space, you also get either 1 building resource of your choice or 1 food. In games with 4 or more players, get both instead."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM054.png',
  },
  impl: cardImpl,
})

export const CWM054_WheelbarrowPusher_impl = CWM054_WheelbarrowPusher.impl
