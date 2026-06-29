import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C032_AbortOriel'

const cardImpl = {
  /**
   * C32 Abort Oriel: cannot be played once any player already has 5 or more
   * cards in front of them. ("May be played as your fifth card" — i.e. you
   * yourself only count BEFORE playing.)
   */
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    for (const other of state.players ?? []) {
      const count =
        (other.improvements?.length ?? 0) +
        (other.minorPlayed?.length ?? 0) +
        (other.occupationPlayed?.length ?? 0)
      if (count >= 5) return false
    }
    return true
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C032_AbortOriel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Abort Oriel',
    deck: 'C',
    number: 32,
    category: 'POINTS_PROVIDER',
    desc: ['You can no longer play this card when any player (including you) has 5 or more cards in front of them.'],
    cost: { clay: 2 },
    vp: 3,
    prerequisite: 'see below',
  },
  impl: cardImpl,
})

export const C032_AbortOriel_impl = C032_AbortOriel.impl
