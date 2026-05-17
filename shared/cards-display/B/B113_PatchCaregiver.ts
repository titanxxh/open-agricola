import { Occupation } from '../types'

const CARD_ID = 'B113_PatchCaregiver'

export const B113_PatchCaregiver = new Occupation({
  id: CARD_ID,
  name: 'Patch Caregiver',
  deck: 'B',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, you can choose to buy 1 <GRAIN> for 1 <FOOD>, or 1 <VEGETABLE> for 3 <FOOD>. This card is a field.'],
  cost: {},
  players: '1+',
  isField: true,
  cardField: { allowedCrops: ['grain', 'vegetable', 'wood', 'stone'], capacity: 1 },
})
