import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getUnfencedStableCountForCards } from '../../../domain/stables'

const CARD_ID = 'CFL046_StableArchitect'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => getUnfencedStableCountForCards(player),
  },
} satisfies CardImpl

export const CFL046_StableArchitect = defineOccupationCard({
  meta: {
    id: 'CFL046_StableArchitect',
    name: 'Stable Architect',
    deck: 'CFL',
    number: 46,
    players: '1+',
    extraVp: true,
    desc: ['During scoring, you get 1 bonus <SCORE> for each unfenced <STABLE> in your farmyard.'],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL046.png',
  },
  impl: cardImpl,
})
