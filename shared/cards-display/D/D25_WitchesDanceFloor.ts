import { MinorImprovement } from '../types'

const CARD_ID = 'D25_WitchesDanceFloor'

export const D25_WitchesDanceFloor = new MinorImprovement({
  id: CARD_ID,
  name: "Witches' Dance Floor",
  deck: 'D',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'This card is a field that you can sow in, an occupation, and the "Fireplace" major improvement with all of its effects.',
    'You can play it only via a "Minor Improvement" action.',
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>      <BOAR> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  cost: {},
  vp: 0,
  prerequisite: 'see below',
  providesField: true,
  providesOccupation: true,
  fireplaceIdentity: true,
  alsoCountsAs: ['major'],
  mustBePlayedViaMinorAction: true,
  isCookery: true,
  isBaking: true,
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, triggers: ['bake-bread'] },
  ],
})
