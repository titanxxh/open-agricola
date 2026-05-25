import { Occupation } from '../../cards-display/types'

const CARD_ID = 'D155_Ebonist'

// BGA: $this->exchanges = [Utils::formatExchange([WOOD => [FOOD => 1, GRAIN => 1], 'max' => 1], …, [HARVEST], …)]

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
    { from: { wood: 1 }, to: { food: 1, grain: 1 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
  ],
})
