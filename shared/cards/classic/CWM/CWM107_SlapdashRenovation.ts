import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM107_SlapdashRenovation'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-ordinary-renovation',
      cardIds: [CARD_ID],
      actionSpaces: ['house-redevelopment', 'farm-redevelopment'],
      phases: ['after'],
      handler: (context) => {
        if (
          !createEventQuery(context.actionEvents ?? [])
            .filter('farm.renovated')
            .some(
              (e) =>
                e.playerId === context.player.id &&
                (!e.sourceCardId || e.sourceCardId === context.space.id),
            )
        )
          return
        const workerId =
          typeof context.actionContext?.placedWorkerId === 'string'
            ? context.actionContext.placedWorkerId
            : [...context.space.takenBy]
                .reverse()
                .find((worker) => worker.playerId === context.player.id)?.workerId
        return workerId
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'recallWorker', value: workerId },
              },
            }
          : undefined
      },
    },
  ],
  effect: {
    id: CARD_ID,
    onEndTurn: (_state, player) => {
      const workerId = readCardExtraData<string>(player, CARD_ID, 'recallWorker')
      return workerId
        ? {
            type: 'seq',
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'recallWorker', value: null },
              },
              {
                type: 'leaf',
                actionId: 'recall-placed-worker',
                sourceCard: CARD_ID,
                params: { workerId, noOpIfMissing: true },
              },
            ],
          }
        : undefined
    },
  },
} satisfies CardImpl

export const CWM107_SlapdashRenovation = defineMinorCard({
  meta: {
    id: 'CWM107_SlapdashRenovation',
    name: "Slapdash Renovation",
    deck: 'CWM',
    number: 107,
    desc: ["After you use an action space providing renovation, return that person home at the end of that turn and place them again on a later turn. Renovations or action spaces supplied by cards do not qualify."],
    cost: {
      clay: 1,
      stone: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM107.png',
  },
  impl: cardImpl,
})

export const CWM107_SlapdashRenovation_impl = CWM107_SlapdashRenovation.impl
