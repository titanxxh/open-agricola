import { Occupation } from '../types'

export const C156_HoofCaregiver = new Occupation({
  id: "C156_HoofCaregiver",
  name: "Hoof Caregiver",
  deck: "C",
  number: 156,
  category: "GOODS_PROVIDER",
  desc: ["Immediately add 1 <CATTLE> from the general supply to the __Cattle Market__ accumulation space. Afterward, for each cattle on __Cattle Market__, you get 1 <GRAIN> plus 1 <FOOD>."],
  cost: {},
  players: "4+",
  newSet: true,
})
