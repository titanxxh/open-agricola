import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { sumResourceMovedToPlayer } from '../../helpers/event-provenance'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM032_Hunter'

const animals = ['sheep', 'boar', 'cattle'] as const
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-animals',
      cardIds: [CARD_ID],
      actions: ['gain', 'collect', 'receive', 'exchange'],
      phases: ['immediatelyAfter'],
      handler: (context) => {
        if (context.state.roundPhase === 'breeding') return
        const events = context.actionEvents ?? []
        const limits = Object.fromEntries(
          animals.map((animal) => [
            CARD_ID + ':' + animal,
            sumResourceMovedToPlayer(events, animal, context.player.id) +
              createEventQuery(events)
                .filter('resource.exchanged')
                .reduce(
                  (n, event) =>
                    n +
                    (event.gainedTo.kind === 'player' &&
                    event.gainedTo.playerId === context.player.id
                      ? (event.gained[animal] ?? 0)
                      : 0),
                  0,
                ),
          ]),
        )
        const tradeIds = Object.keys(limits).filter((key) => limits[key]! > 0)
        if (!tradeIds.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: 'exchange',
            sourceCard: CARD_ID,
            optional: true,
            actionContext: {
              tradeIds,
              maxTradeTimesBySourceId: limits,
            },
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM032_Hunter = defineOccupationCard({
  meta: {
    exchanges: [
      { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'CWM032_Hunter:sheep', triggers: [] },
      { from: { boar: 1 }, to: { food: 3 }, sourceId: 'CWM032_Hunter:boar', triggers: [] },
      { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'CWM032_Hunter:cattle', triggers: [] },
    ],

    id: 'CWM032_Hunter',
    name: "Hunter",
    deck: 'CWM',
    number: 32,
    desc: ["Whenever you acquire animals outside a harvest breeding phase, you may immediately convert any of them to <FOOD>: 2 per <SHEEP>, 3 per <BOAR>, and 4 per <CATTLE>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM032.png',
  },
  impl: cardImpl,
})

export const CWM032_Hunter_impl = CWM032_Hunter.impl
