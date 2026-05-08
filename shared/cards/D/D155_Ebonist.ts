import { Occupation } from '../../cards-display/types'

const CARD_ID = 'D155_Ebonist'

// BGA: $this->exchanges = [Utils::formatExchange([WOOD => [FOOD => 1, GRAIN => 1], 'max' => 1], …, [HARVEST], …)]
// Our exchange system only supports 'anytime' | 'bake-bread' triggers; harvest-only restriction is
// approximated by max:1 per exchange window. Matches the E153_StoneSculptor / D108_StoneCarver precedent.

export const D155_Ebonist = new Occupation({
  id: CARD_ID,
  name: 'Ebonist',
  deck: 'D',
  number: 155,
  category: 'GOODS_PROVIDER',
  desc: ['Each harvest, you can use this card to turn exactly 1 <WOOD> into 1 <FOOD> and 1 <GRAIN>.'],
  cost: {},
  players: '4+',
  exchanges: [
    { from: { wood: 1 }, to: { food: 1, grain: 1 }, max: 1, triggers: ['anytime'] },
  ],
})
