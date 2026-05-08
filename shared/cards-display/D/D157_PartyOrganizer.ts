import { Occupation } from '../types'

const CARD_ID = 'D157_PartyOrganizer'

export const D157_PartyOrganizer = new Occupation({
  id: CARD_ID,
  name: 'Party Organizer',
  deck: 'D',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ["As soon as the next player but you gains their 5th person, you immediately get 8 <FOOD> (not retroactively). During scoring, if only you have 5 people, you get 3 bonus <SCORE>."],
  players: '4+',
  newSet: true,
})
