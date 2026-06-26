import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M071_BogBody'
const MUSEUM = 'Major_Moor_MuseumOfTheMoors'
const LIVING_HISTORY = 'M113_LivingHistoryMuseum'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeSharedPostScore: (state, _owner, summaries) =>
      summaries.flatMap((summary) => {
        const player = state.players.find((entry) => entry.id === summary.playerId)
        if (!player) return []
        const hasMuseum = player.improvements.includes(MUSEUM)
        const hasLivingHistory = player.minorPlayed.includes(LIVING_HISTORY)
        return hasMuseum || hasLivingHistory ? [{ playerId: player.id, score: 1 }] : []
      }),
  },
  reaches: [MUSEUM, LIVING_HISTORY] as readonly string[],
} satisfies CardImpl

export const M071_BogBody = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bog Body",
    deck: "M",
    number: 71,
    category: "POINTS_PROVIDER",
    desc: [
        "During scoring, the owner of the Museum of the Moors and the owner of the Living History Museum each get 1 bonus point. The Museum of the Moors is a major improvement; the Living History Museum is a minor improvement."
    ],
    cost: {},
    vp: 1,
    extraVp: true,
    prerequisite: "At Least 1 Moor",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M071_BogBody_impl = M071_BogBody.impl
