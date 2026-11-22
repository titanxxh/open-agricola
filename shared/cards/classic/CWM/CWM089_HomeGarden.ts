import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { createEventQuery } from '../../../events/query'
import type { GameState, PlayerState } from '../../../contract/types'

const CARD_ID = 'CWM089_HomeGarden'

const schedule = (state: GameState, player: PlayerState) => ({
  ...futureMeeplesNode({
    cardId: CARD_ID,
    playerId: player.id,
    entries: [1, 2, 3]
      .map((offset) => state.round + offset)
      .filter((round) => round <= 14)
      .map((round) => ({ round, resources: { food: 1 } })),
  }),
  sourceCard: CARD_ID,
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      createEventQuery(state.events)
        .filter('farm.renovated')
        .some((e) => e.playerId === player.id && e.round === state.round)
        ? schedule(state, player)
        : undefined,
  },
  listeners: [
    {
      id: CARD_ID + '-renovation',
      cardIds: [CARD_ID],
      actions: ['renovate-house'],
      phases: ['after'],
      handler: (context) =>
        createEventQuery(context.actionEvents ?? [])
          .filter('farm.renovated')
          .some((e) => e.playerId === context.player.id)
          ? { sourceCard: CARD_ID, flow: schedule(context.state, context.player) }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM089_HomeGarden = defineMinorCard({
  meta: {
    id: 'CWM089_HomeGarden',
    name: "Home Garden",
    deck: 'CWM',
    number: 89,
    desc: ["Whenever you renovate, place 1 <FOOD> on each of the next 3 round spaces. You also do this when playing this card if you renovated earlier in the current turn. At the start of those rounds, you get the <FOOD>."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM089.png',
  },
  impl: cardImpl,
})

export const CWM089_HomeGarden_impl = CWM089_HomeGarden.impl
