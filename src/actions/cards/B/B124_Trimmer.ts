import { MinorImprovement } from '../types'

export const B124_Trimmer = new MinorImprovement({
  id: "B124_Trimmer",
  name: "Trimmer",
  deck: "B",
  number: 124,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In each work phase, after you enclose at least one farmyard space, you get 2 <STONE>. (Subdividing an existing pasture does not count.)"],
  cost: {},
  players: "1+",
})
