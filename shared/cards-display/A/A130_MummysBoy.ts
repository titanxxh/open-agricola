import { Occupation } from '../types'

const CARD_ID = 'A130_MummysBoy'

export const A130_MummysBoy = new Occupation({
  id: CARD_ID,
  name: "Mummy's Boy",
  deck: 'A',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "Once per round, when placing a person after your first two, you can place it on the action space with your 2nd person and use that space again, unless it is on the __Meeting Place__ action space.",
  ],
  cost: {},
  players: '3+',
  evenMoreSet: true,
})
