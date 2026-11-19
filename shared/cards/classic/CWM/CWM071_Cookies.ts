import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { roomFoodMarkers } from '../../helpers/room-food-markers'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM071_Cookies'

const rooms = roomFoodMarkers(CARD_ID, true)
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-bake',
      cardIds: [CARD_ID],
      actions: ['bake-bread'],
      phases: ['after'],
      handler: (context) => {
        const count = createEventQuery(context.actionEvents ?? [])
          .filter('resource.exchanged')
          .filter(
            (e) =>
              e.paidFrom.kind === 'player' &&
              e.paidFrom.playerId === context.player.id &&
              (e.gained.food ?? 0) > 0,
          )
          .reduce((sum, e) => sum + (e.paid.grain ?? 0), 0)
        const flow = rooms.flow(context.player, count)
        return flow ? { sourceCard: CARD_ID, flow } : undefined
      },
    },
  ],
  effect: {
    id: CARD_ID,
    onRoomsRemoved: rooms.onRoomsRemoved,
    computeBonusScore: (_state, player) => rooms.score(player),
    getStatePresentation: rooms.presentation,
  },
} satisfies CardImpl

export const CWM071_Cookies = defineMinorCard({
  meta: {
    id: 'CWM071_Cookies',
    name: "Cookies",
    deck: 'CWM',
    number: 71,
    desc: ["Whenever you bake bread, for each grain converted you may place 1 food from your supply on a room without such a marker. That food can no longer be used and is worth 1 bonus point at the end of the game."],
    cost: {},
    vp: 1,
    prerequisite: "1 occupation",
    occupationPrerequisites: {
      min: 1,
    },
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM071.png',
  },
  impl: cardImpl,
})

export const CWM071_Cookies_impl = CWM071_Cookies.impl
