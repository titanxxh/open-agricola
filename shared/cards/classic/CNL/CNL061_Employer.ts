import { defineOccupationCard } from '../../card-source'
import { grantGuestLeaf } from '../../helpers/guest-flow'

const CARD_ID = 'CNL061_Employer'

export const CNL061_Employer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Employer',
    deck: 'CNL',
    number: 61,
    desc: ['Add 4, 7, and 10 to the current round number and place 1 guest token on each corresponding round space. At the start of each of those rounds, take the guest token and use it once that round. Return it to the supply at the end of the round.'],
    players: '1+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      onBuy: (state) => {
        const rounds = [4, 7, 10].map(offset => state.round + offset).filter(round => round <= 14)
        if (!rounds.length) return
        return { type: 'seq', children: rounds.map(round => grantGuestLeaf(CARD_ID, { round })) }
      },
    },
  },
})
