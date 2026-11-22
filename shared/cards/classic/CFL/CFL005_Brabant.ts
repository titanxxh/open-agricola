import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL005_Brabant'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      (['sheep', 'boar', 'cattle'] as const).filter((type) => player.resources[type] === 0)
        .length >= 2
        ? 5
        : 0,
  },
} satisfies CardImpl

export const CFL005_Brabant = defineMinorCard({
  meta: {
    id: 'CFL005_Brabant',
    name: 'Brabant',
    deck: 'CFL',
    number: 5,
    extraVp: true,
    desc: [
      'During scoring, if you have no animals of exactly 2 or 3 types, you get 5 bonus <SCORE>. You still lose the usual points for missing animal types.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL005.png',
  },
  impl: cardImpl,
})
