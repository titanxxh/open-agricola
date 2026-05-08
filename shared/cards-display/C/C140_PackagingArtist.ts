import { Occupation } from '../types'

const CARD_ID = 'C140_PackagingArtist'

export const C140_PackagingArtist = new Occupation({
  id: CARD_ID,
  name: 'Packaging Artist',
  deck: 'C',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <GRAIN>. Each time you get a __Minor Improvement__ action, you can take a __Bake Bread__ action instead.',
  ],
  cost: {},
  players: '3+',
  evenMoreSet: true,
})
