import { Occupation } from '../types'

export const A119_FirewoodCollector = new Occupation({
  id: "A119_FirewoodCollector",
  name: "Firewood Collector",
  deck: "A",
  number: 119,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you use the __Farmland__, __Grain Seeds__, __Grain Utilization__, or __Cultivation__ action space, at the end of that turn, you get 1 <WOOD>."],
  cost: {},
  players: "1+",
})
