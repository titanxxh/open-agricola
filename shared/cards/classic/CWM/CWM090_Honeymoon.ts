import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { activeWorkers } from '../../../domain/player'

const CARD_ID = 'CWM090_Honeymoon'

const cardImpl = {
  prerequisiteCheck: (player, state) =>
    !!state && state.round <= 13 && activeWorkers(player).length >= 2,
  effect: {
    id: CARD_ID,
    onBeforeWork: (state, player) => {
      if (state.round !== 14) return
      writeCardExtraData(
        player,
        CARD_ID,
        'heldWorkerIds',
        activeWorkers(player)
          .slice(0, 2)
          .map((w) => w.id),
      )
    },
    getStatePresentation: (player) => ({
      counters: {
        absent: (readCardExtraData<string[]>(player, CARD_ID, 'heldWorkerIds') ?? []).length,
      },
    }),
  },
} satisfies CardImpl

export const CWM090_Honeymoon = defineMinorCard({
  meta: {
    id: 'CWM090_Honeymoon',
    name: "Honeymoon",
    deck: 'CWM',
    number: 90,
    desc: ["In round 14, you must leave 2 family members unused. You must have at least 2 family members that could otherwise be placed in round 14."],
    cost: {
      food: 2,
    },
    vp: 5,
    prerequisite: "Round 13 or earlier",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM090.png',
  },
  impl: cardImpl,
})

export const CWM090_Honeymoon_impl = CWM090_Honeymoon.impl
