import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../../actions/helpers/placement-constants'

const CARD_ID = 'CWM016_Diplomat'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => ({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'uses', value: state.round <= 7 ? 2 : 1 },
    }),
  },
  listeners: [
    {
      id: CARD_ID + '-occupied',
      cardIds: [CARD_ID],
      actions: ['place-farmer'],
      phases: ['computeArgs'],
      handler: ({ state, player }) => {
        if (state.round !== 14 || (player.cardStates[CARD_ID]?.counters?.uses ?? 0) <= 0) return
        return {
          sourceCard: CARD_ID,
          extraOptions: state.actionSpaces
            .filter((s) => s.takenBy.some((w) => w.playerId !== player.id))
            .map((s) => ({
              value: OCCUPIED_SPACE_CHOICE_PREFIX + s.id,
              labelKey: s.nameKey,
              sourceCard: CARD_ID,
            })),
        }
      },
    },
    {
      id: CARD_ID + '-spend',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      handler: (context) => {
        if (
          context.state.round !== 14 ||
          !context.actionSpaceUse?.newPlacement ||
          !context.space.takenBy.some((w) => w.playerId !== context.player.id)
        )
          return
        if ((context.player.cardStates[CARD_ID]?.counters?.uses ?? 0) <= 0) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-counter', key: 'uses', amount: -1 },
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM016_Diplomat = defineOccupationCard({
  meta: {
    id: 'CWM016_Diplomat',
    name: "Diplomat",
    deck: 'CWM',
    number: 16,
    desc: ["In round 14, you may use an action space occupied by another player once. If you played this card in round 7 or earlier, you may do so twice instead."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM016.png',
  },
  presentation: { counters: ['uses'] },
  impl: cardImpl,
})

export const CWM016_Diplomat_impl = CWM016_Diplomat.impl
