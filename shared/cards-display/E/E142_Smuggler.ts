import { Occupation } from '../types'

const CARD_ID = 'E142_Smuggler'

export const E142_Smuggler = new Occupation({
  id: CARD_ID,
  name: "Smuggler",
  deck: "E",
  number: 142,
  category: "CROPS",
  desc: [
    'In the feeding phase of each harvest, you can exchange up to 2 goods as follows:',
    '[<WOOD> <ARROW> <GRAIN>]',
    'or',
    '[<GRAIN> <ARROW> <STONE>]',
  ],
  cost: {},
  players: "3+",
})
