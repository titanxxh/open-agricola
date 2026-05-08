import { Occupation } from '../../cards-display/types'

const CARD_ID = 'C109_SchnappsDistiller'

export const C109_SchnappsDistiller = new Occupation({
  id: CARD_ID,
  name: 'Schnapps Distiller',
  deck: 'C',
  number: 109,
  category: 'FOOD_PROVIDER',
  desc: ['In the feeding phase of each harvest, you can use this card to turn exactly 1 <VEGETABLE> into 5 <FOOD>.'],
  cost: {},
  players: '1+',
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
  ],
})
