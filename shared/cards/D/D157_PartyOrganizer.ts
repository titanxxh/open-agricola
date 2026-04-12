import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D157_PartyOrganizer'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    if (player.familySize < 5) return 0
    const othersWithFive = state.players.filter((p) => p.id !== player.id && p.familySize >= 5)
    return othersWithFive.length === 0 ? 3 : 0
  },
})

export const D157_PartyOrganizer = new Occupation({
  id: CARD_ID,
  name: "Party Organizer",
  deck: "D",
  number: 157,
  category: "FOOD_PROVIDER",
  desc: ["As soon as the next player but you gains their 5th person, you immediately get 8 <FOOD> (not retroactively). During scoring, if only you have 5 people, you get 3 bonus <SCORE>."],
  cost: {},
  players: "4+",
  newSet: true,
})
