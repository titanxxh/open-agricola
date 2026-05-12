import { Occupation } from '../types'

export const C99_GardenDesigner = new Occupation({
  id: "C99_GardenDesigner",
  name: "Garden Designer",
  deck: "C",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["At the start of scoring, you can place <FOOD> in empty fields. You get 1/2/3 bonus <SCORE> for each field in which you place 1/4/7 <FOOD>."],
  cost: {},
  players: "1+",
  extraVp: true,
})
