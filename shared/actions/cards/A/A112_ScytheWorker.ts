import { Occupation } from '../types'

export const A112_ScytheWorker = new Occupation({
  id: "A112_ScytheWorker",
  name: "Scythe Worker",
  deck: "A",
  number: 112,
  category: "CROP_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <GRAIN>. In the field phase of each harvest, you can harvest 1 additional <GRAIN> from each of your grain fields."],
  cost: {},
  players: "1+",
})
