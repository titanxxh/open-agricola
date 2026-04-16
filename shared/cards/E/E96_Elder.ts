import { Occupation } from '../types'

// E96 Elder: at the start of the work phase of round 1, the player may play this
// card from hand without placing a person.
//
// GAP: our session/engine does not currently have a start-of-round-1 hook that
// can offer an optional, gated occupation-play action (BGA's `stStartOfTurn`
// with `allowedCards: ['E96_Elder']`). Once played through the normal occupation
// action the card has no residual effect — it only counts toward "number of
// occupations in play". The card file is otherwise correct as a static card;
// wiring the free-play requires a core engine/session change and is tracked
// as a remaining-work item.
export const E96_Elder = new Occupation({
  id: 'E96_Elder',
  name: 'Elder',
  deck: 'E',
  number: 96,
  category: 'ACTION_SPACE_EXTENDER',
  desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
  cost: {},
  players: '1+',
})
