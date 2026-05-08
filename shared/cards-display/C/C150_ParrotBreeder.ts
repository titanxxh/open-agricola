import { Occupation } from '../types'

const CARD_ID = 'C150_ParrotBreeder'

export const C150_ParrotBreeder = new Occupation({
  id: CARD_ID,
  name: 'Parrot Breeder',
  deck: 'C',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'On your turn, if you pay 1 <GRAIN> to the general supply, you can use the same action space (unless it is the __Meeting Place__ action space) that the player to your right has just used on their turn (not retroactive).',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
